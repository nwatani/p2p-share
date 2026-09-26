import { db } from "@/db";
import { roomMembers, rooms, users } from "@/db/schema";
import { normalizeRoomSlug, sanitizeDisplayName } from "@/lib/server/room-service";
import { and, eq, sql } from "drizzle-orm";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomSlug?: string;
      roomName?: string;
      displayName?: string;
      requestedRole?: "admin" | "member";
      userId?: string;
    };

    const roomSlug = normalizeRoomSlug(body.roomSlug ?? "");
    const roomName = (body.roomName ?? "General Chat").trim().slice(0, 60) || "General Chat";
    const displayName = sanitizeDisplayName(body.displayName ?? "");
    const requestedRole = body.requestedRole === "admin" ? "admin" : "member";

    if (!roomSlug) {
      return Response.json({ error: "Room slug is required" }, { status: 400 });
    }

    if (!displayName || displayName.length < 2) {
      return Response.json({ error: "Display name must be at least 2 characters" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      let room = await tx.query.rooms.findFirst({ where: eq(rooms.slug, roomSlug) });

      if (!room) {
        const [createdRoom] = await tx
          .insert(rooms)
          .values({ slug: roomSlug, name: roomName })
          .returning();
        room = createdRoom;
      }

      let user: typeof users.$inferSelect | undefined;
      if (body.userId && uuidRegex.test(body.userId)) {
        user = await tx.query.users.findFirst({ where: eq(users.id, body.userId) });
      }

      if (!user) {
        const [createdUser] = await tx.insert(users).values({ displayName }).returning();
        user = createdUser;
      } else {
        const [updatedUser] = await tx
          .update(users)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedUser;
      }

      const [adminCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, "admin")));

      const existingMembership = await tx.query.roomMembers.findFirst({
        where: and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, user.id)),
      });

      let effectiveRole: "admin" | "member" = "member";

      if (existingMembership?.role === "admin") {
        effectiveRole = "admin";
      } else if (requestedRole === "admin" && (adminCount?.count ?? 0) === 0) {
        effectiveRole = "admin";
      }

      const [membership] = await tx
        .insert(roomMembers)
        .values({
          roomId: room.id,
          userId: user.id,
          role: effectiveRole,
          isActive: true,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [roomMembers.roomId, roomMembers.userId],
          set: {
            role: effectiveRole,
            isActive: true,
            lastSeenAt: new Date(),
          },
        })
        .returning();

      return { room, user, membership };
    });

    return Response.json({
      ok: true,
      room: { id: result.room.id, slug: result.room.slug, name: result.room.name },
      user: { id: result.user.id, displayName: result.user.displayName },
      member: { role: result.membership.role },
    });
  } catch (error) {
    console.error("join route error", error);
    return Response.json({ error: "Failed to join room" }, { status: 500 });
  }
}

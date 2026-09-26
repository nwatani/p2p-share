import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { getRoomBySlug } from "@/lib/server/room-service";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as { userId?: string; isActive?: boolean };

    const userId = (body.userId ?? "").trim();
    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const room = await getRoomBySlug(slug);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(roomMembers)
      .set({
        isActive: body.isActive ?? true,
        lastSeenAt: new Date(),
      })
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("presence route error", error);
    return Response.json({ error: "Failed to update presence" }, { status: 500 });
  }
}

import { db } from "@/db";
import { callParticipants, calls, roomMembers } from "@/db/schema";
import { getRoomBySlug, insertSignalEvent } from "@/lib/server/room-service";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as { userId?: string; callId?: string };

    const userId = (body.userId ?? "").trim();
    const callId = (body.callId ?? "").trim();

    if (!userId || !callId) {
      return Response.json({ error: "userId and callId are required" }, { status: 400 });
    }

    const room = await getRoomBySlug(slug);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    const [member, call] = await Promise.all([
      db.query.roomMembers.findFirst({
        where: and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)),
      }),
      db.query.calls.findFirst({ where: and(eq(calls.id, callId), eq(calls.roomId, room.id)) }),
    ]);

    if (!member) {
      return Response.json({ error: "Not a room member" }, { status: 403 });
    }

    if (!call || call.status !== "active") {
      return Response.json({ error: "Call is no longer active" }, { status: 409 });
    }

    await db
      .insert(callParticipants)
      .values({
        callId: call.id,
        roomId: room.id,
        userId,
        audioEnabled: true,
        videoEnabled: call.mode === "video",
        leftAt: null,
      })
      .onConflictDoUpdate({
        target: [callParticipants.callId, callParticipants.userId],
        set: {
          leftAt: null,
          audioEnabled: true,
          videoEnabled: call.mode === "video",
          joinedAt: new Date(),
        },
      });

    await insertSignalEvent({
      roomId: room.id,
      callId: call.id,
      fromUserId: userId,
      type: "participant-joined",
      payload: { callId: call.id },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("join call error", error);
    return Response.json({ error: "Failed to join call" }, { status: 500 });
  }
}

import { db } from "@/db";
import { callParticipants, calls, roomMembers } from "@/db/schema";
import { getRoomBySlug, insertSignalEvent } from "@/lib/server/room-service";
import { and, eq, isNull } from "drizzle-orm";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as {
      userId?: string;
      callId?: string;
      audioEnabled?: boolean;
      videoEnabled?: boolean;
    };

    const userId = (body.userId ?? "").trim();
    const callId = (body.callId ?? "").trim();

    if (!userId || !callId) {
      return Response.json({ error: "userId and callId are required" }, { status: 400 });
    }

    const room = await getRoomBySlug(slug);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    const [member, call, participant] = await Promise.all([
      db.query.roomMembers.findFirst({
        where: and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)),
      }),
      db.query.calls.findFirst({ where: and(eq(calls.id, callId), eq(calls.roomId, room.id)) }),
      db.query.callParticipants.findFirst({
        where: and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.userId, userId),
          isNull(callParticipants.leftAt),
        ),
      }),
    ]);

    if (!member) {
      return Response.json({ error: "Not a room member" }, { status: 403 });
    }

    if (!call || call.status !== "active") {
      return Response.json({ error: "Call not active" }, { status: 409 });
    }

    if (!participant) {
      return Response.json({ error: "Participant not found in active call" }, { status: 409 });
    }

    const audioEnabled = body.audioEnabled ?? participant.audioEnabled;
    const videoEnabled = body.videoEnabled ?? participant.videoEnabled;

    await db
      .update(callParticipants)
      .set({ audioEnabled, videoEnabled })
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)));

    await insertSignalEvent({
      roomId: room.id,
      callId,
      fromUserId: userId,
      type: "media-state",
      payload: { audioEnabled, videoEnabled },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("media state error", error);
    return Response.json({ error: "Failed to update media state" }, { status: 500 });
  }
}

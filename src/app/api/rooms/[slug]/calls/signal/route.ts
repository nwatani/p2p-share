import { db } from "@/db";
import { callParticipants, calls, roomMembers } from "@/db/schema";
import { getRoomBySlug, insertSignalEvent } from "@/lib/server/room-service";
import { and, eq, isNull } from "drizzle-orm";

const allowedTypes = new Set([
  "offer",
  "answer",
  "ice-candidate",
  "media-state",
  "renegotiate",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as {
      userId?: string;
      callId?: string;
      toUserId?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };

    const userId = (body.userId ?? "").trim();
    const callId = (body.callId ?? "").trim();
    const toUserId = (body.toUserId ?? "").trim();
    const type = (body.type ?? "").trim();

    if (!userId || !callId || !toUserId || !type) {
      return Response.json({ error: "userId, callId, toUserId and type are required" }, { status: 400 });
    }

    if (!allowedTypes.has(type)) {
      return Response.json({ error: "Unsupported signal type" }, { status: 400 });
    }

    const room = await getRoomBySlug(slug);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    const [member, call, senderParticipant, receiverParticipant] = await Promise.all([
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
      db.query.callParticipants.findFirst({
        where: and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.userId, toUserId),
          isNull(callParticipants.leftAt),
        ),
      }),
    ]);

    if (!member) {
      return Response.json({ error: "Not a room member" }, { status: 403 });
    }

    if (!call || call.status !== "active") {
      return Response.json({ error: "Call is not active" }, { status: 409 });
    }

    if (!senderParticipant || !receiverParticipant) {
      return Response.json({ error: "Both users must be active call participants" }, { status: 409 });
    }

    await insertSignalEvent({
      roomId: room.id,
      callId,
      fromUserId: userId,
      toUserId,
      type,
      payload: body.payload ?? {},
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("signal route error", error);
    return Response.json({ error: "Failed to send signal" }, { status: 500 });
  }
}

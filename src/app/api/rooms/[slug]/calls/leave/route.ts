import { db } from "@/db";
import { callParticipants, calls, roomMembers } from "@/db/schema";
import { getRoomBySlug, insertSignalEvent } from "@/lib/server/room-service";
import { and, eq, isNull, sql } from "drizzle-orm";

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
      return Response.json({ error: "Call not active" }, { status: 409 });
    }

    await db
      .update(callParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.userId, userId),
          isNull(callParticipants.leftAt),
        ),
      );

    await insertSignalEvent({
      roomId: room.id,
      callId,
      fromUserId: userId,
      type: "participant-left",
      payload: { userId },
    });

    const [activeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, callId), isNull(callParticipants.leftAt)));

    if ((activeCount?.count ?? 0) <= 0) {
      await db
        .update(calls)
        .set({ status: "ended", endedAt: new Date(), endedByUserId: userId, endedReason: "empty" })
        .where(eq(calls.id, callId));

      await insertSignalEvent({
        roomId: room.id,
        callId,
        fromUserId: userId,
        type: "call-ended",
        payload: { reason: "empty" },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("leave call error", error);
    return Response.json({ error: "Failed to leave call" }, { status: 500 });
  }
}

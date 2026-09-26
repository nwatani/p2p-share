import { db } from "@/db";
import { callParticipants, calls, roomMembers, users } from "@/db/schema";
import {
  getLatestSignalEventId,
  getRecentMessages,
  getRoomBySlug,
  getRoomParticipants,
  getSignalsForUser,
} from "@/lib/server/room-service";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const userId = (url.searchParams.get("userId") ?? "").trim();
    const sinceEventId = Number(url.searchParams.get("sinceEventId") ?? "0") || 0;

    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const room = await getRoomBySlug(slug);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    const member = await db.query.roomMembers.findFirst({
      where: and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)),
    });

    if (!member) {
      return Response.json({ error: "Not a room member" }, { status: 403 });
    }

    await db
      .update(roomMembers)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)));

    const [participants, chatMessages, activeCall, signals, latestEventId] = await Promise.all([
      getRoomParticipants(room.id),
      getRecentMessages(room.id),
      db.query.calls.findFirst({
        where: and(eq(calls.roomId, room.id), eq(calls.status, "active")),
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      }),
      getSignalsForUser({ roomId: room.id, userId, sinceEventId }),
      getLatestSignalEventId(room.id),
    ]);

    let activeCallPayload: {
      id: string;
      mode: "voice" | "video";
      startedByUserId: string | null;
      createdAt: Date;
      participants: Array<{
        userId: string;
        displayName: string;
        audioEnabled: boolean;
        videoEnabled: boolean;
      }>;
    } | null = null;

    if (activeCall) {
      const callMembers = await db
        .select({
          userId: callParticipants.userId,
          displayName: users.displayName,
          audioEnabled: callParticipants.audioEnabled,
          videoEnabled: callParticipants.videoEnabled,
        })
        .from(callParticipants)
        .innerJoin(users, eq(users.id, callParticipants.userId))
        .where(and(eq(callParticipants.callId, activeCall.id), isNull(callParticipants.leftAt)));

      activeCallPayload = {
        id: activeCall.id,
        mode: activeCall.mode,
        startedByUserId: activeCall.startedByUserId,
        createdAt: activeCall.createdAt,
        participants: callMembers,
      };
    }

    return Response.json({
      ok: true,
      room: { id: room.id, slug: room.slug, name: room.name },
      self: { role: member.role, isActive: member.isActive },
      participants,
      messages: chatMessages,
      activeCall: activeCallPayload,
      signals,
      latestEventId,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("state route error", error);
    return Response.json({ error: "Failed to fetch room state" }, { status: 500 });
  }
}

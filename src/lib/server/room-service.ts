import { db } from "@/db";
import {
  callParticipants,
  calls,
  messages,
  roomMembers,
  rooms,
  signalEvents,
  users,
} from "@/db/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

export type MemberRole = "admin" | "member";
export type CallMode = "voice" | "video";

export function normalizeRoomSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function sanitizeDisplayName(input: string) {
  return input.trim().replace(/\s+/g, " ").slice(0, 40);
}

export async function getRoomBySlug(slug: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1);
  return room ?? null;
}

export async function getActiveCall(roomId: string) {
  const [activeCall] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.roomId, roomId), eq(calls.status, "active")))
    .orderBy(desc(calls.createdAt))
    .limit(1);

  return activeCall ?? null;
}

export async function getMember(roomId: string, userId: string) {
  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);

  return member ?? null;
}

export async function requireRoomMember(slug: string, userId: string) {
  const room = await getRoomBySlug(slug);

  if (!room) {
    throw new Error("Room not found");
  }

  const member = await getMember(room.id, userId);

  if (!member) {
    throw new Error("User is not a member of this room");
  }

  return { room, member };
}

export async function getRoomParticipants(roomId: string) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      role: roomMembers.role,
      isActive: roomMembers.isActive,
      joinedAt: roomMembers.joinedAt,
      lastSeenAt: roomMembers.lastSeenAt,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(desc(roomMembers.role), users.displayName);
}

export async function getRecentMessages(roomId: string, limit = 150) {
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      userId: users.id,
      displayName: users.displayName,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.reverse();
}

export async function getCallParticipants(callId: string) {
  return db
    .select({
      userId: callParticipants.userId,
      displayName: users.displayName,
      audioEnabled: callParticipants.audioEnabled,
      videoEnabled: callParticipants.videoEnabled,
      joinedAt: callParticipants.joinedAt,
      leftAt: callParticipants.leftAt,
    })
    .from(callParticipants)
    .innerJoin(users, eq(users.id, callParticipants.userId))
    .where(and(eq(callParticipants.callId, callId), isNull(callParticipants.leftAt)));
}

export async function getSignalsForUser(params: {
  roomId: string;
  userId: string;
  sinceEventId: number;
}) {
  const { roomId, userId, sinceEventId } = params;
  const rows = await db
    .select({
      id: signalEvents.id,
      callId: signalEvents.callId,
      fromUserId: signalEvents.fromUserId,
      toUserId: signalEvents.toUserId,
      type: signalEvents.type,
      payload: signalEvents.payload,
      createdAt: signalEvents.createdAt,
    })
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.roomId, roomId),
        gt(signalEvents.id, sinceEventId),
        sql`(${signalEvents.toUserId} is null or ${signalEvents.toUserId} = ${userId})`,
        sql`${signalEvents.fromUserId} <> ${userId}`,
      ),
    )
    .orderBy(signalEvents.id)
    .limit(500);

  return rows;
}

export async function getLatestSignalEventId(roomId: string) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${signalEvents.id}), 0)` })
    .from(signalEvents)
    .where(eq(signalEvents.roomId, roomId));

  return row?.value ?? 0;
}

export async function insertSignalEvent(input: {
  roomId: string;
  callId?: string | null;
  fromUserId: string;
  toUserId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(signalEvents)
    .values({
      roomId: input.roomId,
      callId: input.callId ?? null,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    })
    .returning();

  return event;
}

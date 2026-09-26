import { db } from "@/db";
import { callParticipants, calls, roomMembers } from "@/db/schema";
import { getActiveCall, getRoomBySlug, insertSignalEvent } from "@/lib/server/room-service";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as { userId?: string; mode?: "voice" | "video" };

    const userId = (body.userId ?? "").trim();
    const mode = body.mode === "video" ? "video" : "voice";

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

    if (member.role !== "admin") {
      return Response.json({ error: "Only room admin can start a call" }, { status: 403 });
    }

    const existingCall = await getActiveCall(room.id);
    if (existingCall) {
      return Response.json({ error: "An active call already exists", callId: existingCall.id }, { status: 409 });
    }

    const [createdCall] = await db
      .insert(calls)
      .values({ roomId: room.id, startedByUserId: userId, mode, status: "active" })
      .returning();

    await db.insert(callParticipants).values({
      callId: createdCall.id,
      roomId: room.id,
      userId,
      audioEnabled: true,
      videoEnabled: mode === "video",
    });

    await insertSignalEvent({
      roomId: room.id,
      callId: createdCall.id,
      fromUserId: userId,
      type: "call-started",
      payload: { mode },
    });

    return Response.json({ ok: true, call: createdCall });
  } catch (error) {
    console.error("start call error", error);
    return Response.json({ error: "Failed to start call" }, { status: 500 });
  }
}

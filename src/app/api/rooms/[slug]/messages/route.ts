import { db } from "@/db";
import { messages, roomMembers } from "@/db/schema";
import { getRoomBySlug } from "@/lib/server/room-service";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as { userId?: string; message?: string };

    const userId = (body.userId ?? "").trim();
    const text = (body.message ?? "").trim();

    if (!userId || !text) {
      return Response.json({ error: "userId and message are required" }, { status: 400 });
    }

    if (text.length > 1000) {
      return Response.json({ error: "Message is too long" }, { status: 400 });
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

    const [created] = await db
      .insert(messages)
      .values({ roomId: room.id, userId, body: text })
      .returning();

    return Response.json({ ok: true, message: created });
  } catch (error) {
    console.error("messages route error", error);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

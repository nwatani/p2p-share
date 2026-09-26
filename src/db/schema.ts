import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);
export const callModeEnum = pgEnum("call_mode", ["voice", "video"]);
export const callStatusEnum = pgEnum("call_status", ["active", "ended"]);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rooms_slug_unique").on(table.slug)],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: memberRoleEnum("role").default("member").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("room_members_room_user_unique").on(table.roomId, table.userId),
    index("room_members_room_idx").on(table.roomId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("messages_room_created_idx").on(table.roomId, table.createdAt)],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    startedByUserId: uuid("started_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    mode: callModeEnum("mode").notNull(),
    status: callStatusEnum("status").default("active").notNull(),
    endedByUserId: uuid("ended_by_user_id").references(() => users.id, { onDelete: "set null" }),
    endedReason: text("ended_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("calls_room_status_idx").on(table.roomId, table.status, table.createdAt)],
);

export const callParticipants = pgTable(
  "call_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: uuid("call_id")
      .references(() => calls.id, { onDelete: "cascade" })
      .notNull(),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    audioEnabled: boolean("audio_enabled").default(true).notNull(),
    videoEnabled: boolean("video_enabled").default(false).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("call_participants_call_user_unique").on(table.callId, table.userId),
    index("call_participants_room_call_idx").on(table.roomId, table.callId),
  ],
);

export const signalEvents = pgTable(
  "signal_events",
  {
    id: serial("id").primaryKey(),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("signal_events_room_id_idx").on(table.roomId, table.id)],
);

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const channels = pgTable(
  "channels", {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 6 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    adminTokenHash: text("admin_token_hash").notNull(),
    snsTopicArn: text("sns_topic_arn"),
    qrS3Key: text("qr_s3_key"),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    creatorIpHash: text("creator_ip_hash"),
  }
);

export const subscriptions = pgTable(
  "subscriptions", {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id),
    displayNo: integer("display_no").notNull(),
    nickname: varchar("nickname", { length: 30 }),
    deliveryMethod: varchar("delivery_method", { length: 20 }).notNull().default("WEBPUSH"),
    endpointData: jsonb("endpoint_data").notNull(),
    deviceKey: varchar("device_key", { length: 64 }).notNull(),
    clientEnv: varchar("client_env", { length: 30 }),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_channel_status_idx").on(table.channelId, table.status),
    uniqueIndex("subscriptions_channel_device_unique").on(table.channelId, table.deviceKey),
    uniqueIndex("subscriptions_channel_display_no_unique").on(table.channelId, table.displayNo),
  ]
);

export const notifications = pgTable(
  "notifications", {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id),
    title: varchar("title", { length: 100 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("QUEUED"),
    totalCount: integer("total_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  }
);

export const notificationActions = pgTable(
  "notification_actions", {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id),
    actionKey: varchar("action_key", { length: 20 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    label: varchar("label", { length: 30 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.notificationId, table.actionKey] })]
);

export const responses = pgTable(
  "responses", {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    actionKey: varchar("action_key", { length: 20 }).notNull(),
    respondedAt: timestamp("responded_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.notificationId, table.subscriptionId] })]
);

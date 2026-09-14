import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const channels = pgTable("channels", {
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
});

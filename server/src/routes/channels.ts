import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "../db/client";
import { channels } from "../db/schema";
import { generateChannelCode } from "../lib/channelCode";
import { generateAdminToken, hashToken } from "../lib/token";
import { BASE_URL } from "../config";

export const channelsRouter = Router();

channelsRouter.post("/", async (req: Request, res: Response) => {
  const { name, description, expiresAt } = req.body;

  if (!name || !expiresAt) {
    res.status(400).json({ error: "name과 expiresAt은 필수입니다." });
    return;
  }

  const expiresAtDate = new Date(expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) {
    res.status(400).json({ error: "expiresAt이 올바른 날짜 형식이 아닙니다." });
    return;
  }

  const adminToken = generateAdminToken();

  const [channel] = await db
    .insert(channels)
    .values({
      code: generateChannelCode(),
      name,
      description,
      adminTokenHash: hashToken(adminToken),
      expiresAt: expiresAtDate,
    })
    .returning();

  console.log("채널 생성됨:", channel.code, channel.name);

  res.status(201).json({
    channelId: channel.id,
    code: channel.code,
    subscribeUrl: `${BASE_URL}/c/${channel.code}`,
    qrUrl: `${BASE_URL}/channels/${channel.id}/qr`,
    adminUrl: `${BASE_URL}/admin/${channel.id}?token=${adminToken}`,
  });
});

channelsRouter.get("/:id/qr", async (req: Request<{ id: string }>, res: Response) => {
  const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

  if (!channel) {
    res.status(404).json({ error: "채널을 찾을 수 없습니다." });
    return;
  }

  const subscribeUrl = `${BASE_URL}/c/${channel.code}`;
  const qrPng = await QRCode.toBuffer(subscribeUrl, { type: "png", width: 400 });

  res.type("png").send(qrPng);
});

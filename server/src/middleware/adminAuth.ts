import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { channels } from "../db/schema";
import { hashToken } from "../lib/token";

export async function requireAdminAuth(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Authorization 헤더가 필요합니다." });
    return;
  }

  const [channel] = await db.select().from(channels).where(eq(channels.id, req.params.id));

  if (!channel) {
    res.status(404).json({ error: "채널을 찾을 수 없습니다." });
    return;
  }

  if (channel.adminTokenHash !== hashToken(token)) {
    res.status(403).json({ error: "관리자 토큰이 올바르지 않습니다." });
    return;
  }

  next();
}

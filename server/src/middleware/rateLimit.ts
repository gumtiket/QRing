import rateLimit from "express-rate-limit";

// IP당 시간당 채널 생성 10개
export const createChannelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "채널 생성 한도(시간당 10개)를 초과했습니다." },
});

// 채널당 분당 메세지 발송 5개
export const sendNotificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.id as string,
  message: { error: "이 채널의 발송 한도(분당 5회)를 초과했습니다." },
});

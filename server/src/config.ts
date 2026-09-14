import "dotenv/config";
import webpush from "web-push";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.env에 ${name}이 설정되어 있지 않습니다.`);
  }
  return value;
}

export const PORT = Number(process.env.PORT ?? 3000);
export const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
export const VAPID_PUBLIC_KEY = requireEnv("VAPID_PUBLIC_KEY");

const VAPID_PRIVATE_KEY = requireEnv("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
console.log("VAPID 설정 완료:", VAPID_PUBLIC_KEY);

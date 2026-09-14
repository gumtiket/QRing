import { randomInt } from "crypto";

// MVP 문서 4장: 0, O, 1, I는 헷갈리기 쉬워서 뺀다.
const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export function generateChannelCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}

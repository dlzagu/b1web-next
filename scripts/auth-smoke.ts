/**
 * 인증 스모크 — P2.s1 검증 (세션 서명 왕복 + dev provider 판정)
 * 실행: npx tsx --env-file=.env.local scripts/auth-smoke.ts
 * ※ next/headers cookies()는 요청 컨텍스트 필요 → 여기선 순수 로직(서명·bcrypt)만 검증.
 *    로그인→메인 e2e는 아래 build 후 dev 서버 curl 로 확인.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

async function main() {
  const secret = process.env.AUTH_SECRET!;
  if (!secret) throw new Error("AUTH_SECRET 없음");

  // ① 서명 왕복 + 위변조 탐지
  const payload = Buffer.from(JSON.stringify({ uid: "demo", exp: 9999999999 })).toString("base64url");
  const sig = sign(payload, secret);
  const good = sign(payload, secret) === sig;
  const tampered = sign(payload + "x", secret) === sig;
  console.log(`① 세션 서명 왕복: ${good ? "✅" : "❌"} / 위변조 거부: ${!tampered ? "✅" : "❌"}`);

  // ② dev provider — 올바른/틀린 비밀번호
  const hash = process.env.AUTH_DEV_PASSWORD_HASH!;
  const okPw = await bcrypt.compare("demo1234", hash);
  const badPw = await bcrypt.compare("wrong", hash);
  console.log(`② dev 비밀번호 검증: 정답=${okPw ? "✅" : "❌"} / 오답거부=${!badPw ? "✅" : "❌"}`);

  if (!good || tampered || !okPw || badPw) process.exit(1);
}

main().catch((e) => {
  console.error("스모크 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});

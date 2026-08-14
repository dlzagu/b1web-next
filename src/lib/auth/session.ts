/**
 * 세션 (P2.s1) — HMAC 서명된 httpOnly 쿠키 기반 stateless 세션.
 *
 * 설계 원칙:
 * - 세션에 비밀번호를 담지 않는다.
 * - 인증은 bcrypt 해시 대조 (authenticate.ts).
 * - 쿠키는 httpOnly + signed + 만료. 서명키 AUTH_SECRET.
 */
import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";
import { SESSION_COOKIE as COOKIE } from "./constants";

const MAX_AGE_SEC = 8 * 60 * 60; // 8시간

export interface SessionUser {
  uid: string; // 로그인 ID
  name: string; // 표시명
  corp?: string; // 회사 코드 (테넌트)
  exp: number; // epoch seconds
}

/**
 * 세션 서명 키. 데모는 환경변수 없이 클론 즉시 돌아야 하므로 기본값을 둔다.
 * ⚠️ 실서비스라면 AUTH_SECRET 필수 — 기본값은 공개 저장소에 있어 서명 위조가 가능하다.
 *    (이 앱의 데모 DB 는 가상 데이터뿐이라 위조로 얻을 것이 없다)
 */
const DEMO_SECRET = "b1web-demo-secret-not-for-production-use";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (s) throw new Error("AUTH_SECRET 이 너무 짧습니다 (16자 이상)");
  return DEMO_SECRET;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

/** payload(base64url).sig 형태로 직렬화 */
function serialize(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function deserialize(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // 타이밍 안전 비교
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const user = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionUser;
    if (!user.exp || user.exp * 1000 < Date.now()) return null; // 만료
    return user;
  } catch {
    return null;
  }
}

/** 현재 세션 사용자 (없으면 null) */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return deserialize(store.get(COOKIE)?.value);
}

/** 로그인 성공 시 세션 쿠키 발급 */
export async function createSession(
  user: Omit<SessionUser, "exp">,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const full: SessionUser = { ...user, exp };
  const store = await cookies();
  store.set(COOKIE, serialize(full), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** 로그아웃 — 세션 쿠키 삭제 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export { SESSION_COOKIE } from "./constants";

/**
 * 인증 provider — username/password → SessionUser | null
 *
 * 포트폴리오 데모라 계정 정책이 단순하다:
 *  - **데모 계정(demo)은 항상 유효**하다. 데이터가 전부 가상이고 비밀번호가 README 에
 *    공개돼 있어 숨길 것이 없으며, 무엇보다 환경변수 상태와 무관하게 데모가 열려야 한다
 *    (배포처·로컬에 낡은 AUTH_DEV_* 가 남아 있어도 링크를 받은 사람이 못 들어가면 안 된다).
 *  - env 로 계정을 하나 **추가** 지정할 수 있다 (사설 배포용). 데모 계정을 덮지는 않는다.
 *
 * 비밀번호는 bcrypt 해시로 대조하고,
 * 세션에는 비밀번호를 담지 않는다(session.ts).
 */
import "server-only";
import bcrypt from "bcryptjs";
import { COMPANY_DB } from "@/lib/db/demo-seed/corpus";
import type { SessionUser } from "./session";

type AuthResult = Omit<SessionUser, "exp"> | null;

/** 데모 계정 — 공개 저장소이므로 비밀번호는 README 에 명시된 데모용이다 */
export const DEMO_USER = "demo";
/**
 * 데모 비밀번호 — **의도적으로 공개**다(README·로그인 화면에도 그대로 노출).
 * 포트폴리오 방문자가 계정을 몰라 첫 화면에서 이탈하지 않도록 '둘러보기' 버튼이 이 값을 쓴다.
 * 이 계정으로 접근 가능한 것은 전부 가상 시드 데이터뿐이라 얻을 수 있는 권한이 없다.
 */
export const DEMO_PASSWORD = "demo1234";
/** bcrypt("demo1234", 10) — 값이 노출돼도 가상 데이터 데모 외에는 아무 권한이 없다 */
const DEMO_HASH =
  "$2b$10$RbHy.dQc9YpjZtLYgr8amei6QElWvwexpBMj2..wduD9G7W.c48iK";

export async function authenticate(
  username: string,
  password: string,
): Promise<AuthResult> {
  const accounts: { user: string; hash: string }[] = [
    { user: DEMO_USER, hash: DEMO_HASH },
  ];
  const envUser = process.env.AUTH_DEV_USER;
  const envHash = process.env.AUTH_DEV_PASSWORD_HASH;
  if (envUser && envHash && envUser !== DEMO_USER) {
    accounts.push({ user: envUser, hash: envHash });
  }

  const account = accounts.find((a) => a.user === username);
  if (!account) return null;
  const ok = await bcrypt.compare(password, account.hash).catch(() => false);
  if (!ok) return null;
  return { uid: account.user, name: "데모 사용자", corp: COMPANY_DB };
}

/**
 * 인증 상수 — Edge/proxy(구 middleware)에서도 안전하게 import 가능 (server-only·node:crypto 미포함).
 * proxy가 세션 쿠키명만 필요할 때 session.ts 전체를 Edge 번들로 끌어들이지 않도록 분리.
 */
export const SESSION_COOKIE = "b1web_session";

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * 라우트 보호 (Next.js 16: Middleware → Proxy 개명, 기능 동일).
 * Edge 런타임이라 여기선 쿠키 "존재"만 확인(HMAC 서명 검증은 페이지의 getSession()이 수행).
 * 미인증 접근 → /login 리다이렉트. /login·/health·정적자원·인증 API는 공개.
 */
const PUBLIC_PREFIXES = ["/login", "/health", "/_next", "/favicon.ico"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 정적 자산 제외 전부 통과
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

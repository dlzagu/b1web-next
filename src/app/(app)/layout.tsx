import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

export const dynamic = "force-dynamic";

/**
 * 인증 영역 셸 (P2.s2) — 세션 게이트(위조 쿠키 차단) + 헤더 + 사이드 메뉴 + 콘텐츠.
 * /login, /health 는 이 그룹 밖이라 셸 없이 렌더.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <Header user={user} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="b1w-scroll min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

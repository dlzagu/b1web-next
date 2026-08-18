import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import type { SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui";
import MobileNav from "./MobileNav";

export default function Header({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-50 flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface/72 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-6">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-0">
      {/* 모바일 전용 메뉴 드로어 트리거 */}
      <MobileNav />
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-foreground">
          <span className="h-2 w-2 rounded-[2px] bg-surface" />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-foreground">
          B1WEB <span className="font-normal text-faint">ERP</span>
        </span>
      </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[13px] md:gap-4">
        {/* 좁은 화면에서는 사용자명을 접어 로그아웃 버튼 자리를 확보한다 */}
        <span className="hidden text-muted sm:inline">
          {user.name} <span className="text-faint">({user.uid})</span>
        </span>
        <form action={logoutAction}>
          <Button variant="outline" size="sm">
            로그아웃
          </Button>
        </form>
      </div>
    </header>
  );
}

import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import type { SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui";

export default function Header({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-50 flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface/72 px-6 backdrop-blur-xl backdrop-saturate-150">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-foreground">
          <span className="h-2 w-2 rounded-[2px] bg-surface" />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-foreground">
          B1WEB <span className="font-normal text-faint">ERP</span>
        </span>
      </Link>
      <div className="flex items-center gap-4 text-[13px]">
        <span className="text-muted">
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

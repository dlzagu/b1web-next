import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // 이미 로그인 상태면 메인으로
  if (await getSession()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-card bg-foreground">
            <span className="h-3.5 w-3.5 rounded-[3px] bg-surface" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">B1WEB</h1>
          <p className="mt-1 text-sm text-muted">Web ERP</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

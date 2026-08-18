"use client";

import { useActionState } from "react";
import { demoLoginAction, loginAction, type LoginState } from "./actions";
import { Button, Input, Field, Card } from "@/components/ui";

const initial: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <Card className="shadow-sm">
      <form action={formAction} className="flex flex-col gap-4 p-6 pb-4">
        <Field label="아이디">
          <Input name="username" type="text" autoComplete="username" autoFocus />
        </Field>
        <Field label="비밀번호">
          <Input name="password" type="password" autoComplete="current-password" />
        </Field>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "로그인 중…" : "로그인"}
        </Button>
      </form>

      {/* 포트폴리오 방문자용 원클릭 진입 — 계정을 몰라 첫 화면에서 이탈하는 것을 막는다 */}
      <div className="px-6 pb-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-faint">처음 오셨나요?</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action={demoLoginAction}>
          <Button type="submit" variant="outline" className="w-full">
            데모 계정으로 둘러보기
          </Button>
        </form>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
          직접 입력하려면 <span className="font-medium text-muted">demo</span> /{" "}
          <span className="font-medium text-muted">demo1234</span>
          <br />
          모든 데이터는 가상이며 실존 회사·거래처·인물이 아닙니다.
        </p>
      </div>
    </Card>
  );
}

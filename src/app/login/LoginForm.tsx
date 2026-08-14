"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Button, Input, Field, Card } from "@/components/ui";

const initial: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <Card className="shadow-sm">
      <form action={formAction} className="flex flex-col gap-4 p-6">
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
    </Card>
  );
}

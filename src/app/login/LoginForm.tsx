"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { demoLoginAction, loginAction, type LoginState } from "./actions";
import { Button, Input, Field, Card } from "@/components/ui";

const initial: LoginState = {};

/** 진행 중 표시 — 라벨을 바꾸고 스피너를 붙인다 */
function Spinner() {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px] opacity-70"
    />
  );
}

/**
 * 데모 로그인 버튼 — **form 의 자식**이라야 useFormStatus 가 그 form 의 상태를 읽는다.
 *
 * 🔴 여기에 진행 표시가 없으면 버튼을 눌러도 화면이 그대로다. 인증(bcrypt) + 세션 발급 +
 *    대시보드 렌더가 전부 끝나야 화면이 바뀌는데, 공유 DB(원격) 전환 뒤로는 쿼리마다
 *    네트워크 왕복이 붙어 그 침묵이 눈에 띄게 길어졌다(사용자 피드백). pending 은 서버
 *    액션이 끝난 뒤 **리다이렉트 내비게이션이 완료될 때까지** 유지되므로 공백 없이 이어진다.
 */
function DemoButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Spinner />
          데모 데이터 불러오는 중…
        </>
      ) : (
        "데모 계정으로 둘러보기"
      )}
    </Button>
  );
}

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
          {pending ? (
            <>
              <Spinner />
              로그인 중…
            </>
          ) : (
            "로그인"
          )}
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
          <DemoButton />
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

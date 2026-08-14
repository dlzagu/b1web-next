"use server";

import { redirect } from "next/navigation";
import { authenticate } from "@/lib/auth/authenticate";
import { createSession, destroySession } from "@/lib/auth/session";

export type LoginState = { error?: string };

/** 로그인 서버 액션 (useActionState 용) */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "아이디와 비밀번호를 입력하세요." };

  let user;
  try {
    user = await authenticate(username, password);
  } catch (e) {
    // 인증 provider 설정 오류 등 — 사용자에겐 일반 메시지, 세부는 서버 로그
    console.error("[login] provider error:", e instanceof Error ? e.message : e);
    return { error: "인증 처리 중 오류가 발생했습니다. 관리자에게 문의하세요." };
  }
  if (!user) return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };

  await createSession(user);
  redirect("/");
}

/** 로그아웃 서버 액션 */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

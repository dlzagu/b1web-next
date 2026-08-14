"use client";

/**
 * SearchPanel — 조회조건 영역. 조회 시 클라이언트 라우팅(useTransition)으로
 * 상단 로딩바 + 버튼 pending 을 표시(사용자가 '조회 중'임을 인지). 결과는 서버 컴포넌트 재렌더.
 * 초기화는 하드 내비게이션으로 폼·쿼리 완전 리셋. 공용 래퍼 — 전 화면 적용.
 */
import type { ReactNode, FormEvent } from "react";
import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, Input, Select, Field, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export function SearchPanel({
  children,
  actions,
}: {
  children: ReactNode;
  /** 추가 액션 버튼 (엑셀 등) — 조회/초기화 옆 */
  actions?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) params.set(k, s);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <form
      onSubmit={onSubmit}
      className="relative mb-4 overflow-hidden rounded-card bg-surface-container p-4"
    >
      {pending && <span className="c4-loading-bar" aria-hidden />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "조회 중…" : "조회"}
        </Button>
        {/* 초기화 = 쿼리·폼 완전 리셋 (하드 내비게이션) */}
        <a href={pathname} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          초기화
        </a>
        {pending && (
          <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
            불러오는 중…
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </form>
  );
}

type Option = { value: string; label: string };

/** 검색 필드 (라벨 + input/select). name = URL query 키 = 프로시저 파라미터 매핑 */
export function SearchField({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
  options,
}: {
  label: string;
  name: string;
  type?: "text" | "date" | "number" | "select";
  defaultValue?: string;
  placeholder?: string;
  options?: Option[];
}) {
  return (
    <Field label={label}>
      {type === "select" ? (
        <Select name={name} defaultValue={defaultValue}>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
      )}
    </Field>
  );
}

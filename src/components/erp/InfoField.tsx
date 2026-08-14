/**
 * InfoField — 상세화면 정보 필드(dt 라벨 + dd 값) 공통 컴포넌트.
 * 9개 상세화면이 각자 중복 정의하던 로컬 `Info` 를 하나로 수렴(D-4).
 * ⚠️ 라벨은 한글이라 uppercase 미적용(무효 + tracking 만 어색해짐). tracking-wide + faint 로 조용한 라벨.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** dt 라벨 단독 스타일 — 라벨만 필요할 때 재사용(그리드/섹션 캡션 등). */
export function DetailLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <dt className={cn("text-[11px] tracking-wide text-faint", className)}>{children}</dt>;
}

/** 라벨 + 값 한 쌍(dl 안에서 사용). 값이 falsy 면 "-" 표시. */
export function InfoField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <DetailLabel>{label}</DetailLabel>
      <dd className="mt-0.5 truncate text-sm text-foreground">{children || "-"}</dd>
    </div>
  );
}

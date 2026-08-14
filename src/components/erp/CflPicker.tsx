"use client";

/**
 * CflPicker — 제어형(controlled) CFL 선택 컨트롤. 폼/라인셀 공용.
 * CflField(SearchPanel용, hidden input 제출)와 달리 value/onChange 로 부모가 상태 소유.
 * 헤더 거래처·라인 품목처럼 실시간 계산(라인합계)·편집 프리필이 필요한 폼에서 사용.
 */
import { useState } from "react";
import CflModal, { type CflSelection } from "./CflModal";
import { cn } from "@/lib/ui/cn";

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function CflPicker({
  type,
  value,
  label,
  onChange,
  placeholder = "선택…",
  title,
  className,
  allowClear = true,
  showSearchButton = true,
}: {
  /** CFL 소스 타입 — Customer/Vendor/Item/Warehouse 등 (lib/cfl/actions.ts SOURCES) */
  type: string;
  value: string;
  /** 표시명(없으면 코드 표시) */
  label?: string;
  onChange: (sel: CflSelection) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  allowClear?: boolean;
  /** 라인셀처럼 좁은 곳에선 돋보기 버튼 생략 가능 */
  showSearchButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const text = label || value;

  return (
    <div className={cn("flex items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 min-w-0 flex-1 items-center rounded-field border border-border bg-surface px-3 text-left text-[13px] transition-colors hover:border-border-strong",
          text ? "text-foreground" : "text-faint",
        )}
      >
        <span className="truncate">{text || placeholder}</span>
      </button>
      {allowClear && value && (
        <button
          type="button"
          onClick={() => onChange({ value: "", label: "" })}
          aria-label="지우기"
          className="shrink-0 rounded-field border border-border px-2 text-muted transition-colors hover:text-foreground"
        >
          ✕
        </button>
      )}
      {showSearchButton && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="찾기"
          className="flex shrink-0 items-center rounded-field border border-border px-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <SearchIcon />
        </button>
      )}
      <CflModal
        open={open}
        type={type}
        title={title ?? label}
        onSelect={(s) => {
          onChange(s);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

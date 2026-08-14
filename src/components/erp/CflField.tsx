"use client";

/**
 * CflField — SearchPanel 안에서 쓰는 CFL 검색필드(공통).
 * 코드 대신 목록에서 선택. 표시는 이름, 폼 제출값(name)은 코드(hidden input).
 * SearchField 자리에 그대로 대체 가능. 지원 타입은 lib/cfl/actions.ts SOURCES 참조.
 */
import { useState } from "react";
import { Field } from "@/components/ui";
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

export function CflField({
  label,
  name,
  cflType,
  title,
  defaultValue = "",
  defaultLabel,
  placeholder,
}: {
  label: string;
  name: string;
  /** CFL 소스 타입 — Customer/Vendor/Item/SalesEmployee/Warehouse/BusinessPlace/Owner/ItemGroup */
  cflType: string;
  title?: string;
  /** 초기 코드(URL 필터값) */
  defaultValue?: string;
  /** 초기 표시명(있으면 이름 표시, 없으면 코드) */
  defaultLabel?: string;
  placeholder?: string;
}) {
  const [code, setCode] = useState(defaultValue);
  const [text, setText] = useState(defaultLabel ?? defaultValue);
  const [open, setOpen] = useState(false);

  const pick = (sel: CflSelection) => {
    setCode(sel.value);
    setText(sel.label);
    setOpen(false);
  };
  const clear = () => {
    setCode("");
    setText("");
  };

  return (
    <Field label={label}>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center rounded-field border border-border bg-surface px-3 text-left text-[13px] transition-colors hover:border-border-strong",
            text ? "text-foreground" : "text-faint",
          )}
        >
          <span className="truncate">{text || placeholder || "선택하려면 클릭…"}</span>
        </button>
        {code && (
          <button
            type="button"
            onClick={clear}
            aria-label="지우기"
            className="shrink-0 rounded-field border border-border px-2 text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="찾기"
          className="flex shrink-0 items-center rounded-field border border-border px-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <SearchIcon />
        </button>
      </div>
      <input type="hidden" name={name} value={code} readOnly />
      <CflModal open={open} type={cflType} title={title ?? label} onSelect={pick} onClose={() => setOpen(false)} />
    </Field>
  );
}

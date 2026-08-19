"use client";

/**
 * SearchBar — 설정(config) 기반 공통 조회조건 바. 모든 조회화면 공용.
 * - 필드 풀(SearchFieldDef[])을 선언하면 사용자가 [조건]에서 표시할 필드를 선택 → localStorage(사용자별·화면별) 저장.
 * - CFL 가능한 필드(kind:"cfl")는 자동으로 CflField(모달 검색) 렌더 — rules.md CFL 필수적용 규칙 준수.
 * - 제출/로딩바/초기화는 SearchPanel(useTransition)이 처리 → SearchBar 는 어떤 필드를 어떤 값으로 렌더할지만 결정.
 * - 값은 서버(searchParams)에서 values 로 주입(uncontrolled defaultValue). 숨긴 필드는 제출에서 제외(=필터 미적용).
 */
import { useEffect, useRef, useState } from "react";
import { SearchPanel, SearchField } from "./SearchPanel";
import { CflField } from "./CflField";

export type SearchFieldDef = {
  /** URL query 키 = 서버 WHERE 파라미터 */
  name: string;
  label: string;
  /** cfl=마스터 모달검색 / select=드롭다운 / hidden=화면 밖 상태값 / 그 외=입력 */
  kind?: "text" | "date" | "number" | "select" | "cfl" | "hidden";
  /** kind:"cfl" 소스 (Customer/Vendor/Item/Warehouse/BusinessPlace/SalesEmployee/Owner/ItemGroup) */
  cflType?: string;
  /** kind:"select" 옵션 */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** 기본 표시 여부(미지정=표시). false면 사용자가 [조건]에서 켜야 보임 */
  defaultShown?: boolean;
};

function SlidersIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}

export function SearchBar({
  fields,
  values,
  storageKey,
}: {
  fields: SearchFieldDef[];
  /** 현재 필터 값 (서버 searchParams → { name: value }) */
  values: Record<string, string>;
  /** 지정 시 조건 선택 + 표시필드 localStorage 영속화 (사용자별·화면별 키) */
  storageKey?: string;
}) {
  // hidden 필드(탭 등 화면 상태값)는 조건 선택기 대상이 아니며 항상 제출된다 — 조회해도 상태가 풀리지 않게.
  const visibleFields = fields.filter((f) => f.kind !== "hidden");
  const hiddenFields = fields.filter((f) => f.kind === "hidden");
  const defaults = () => visibleFields.filter((f) => f.defaultShown !== false).map((f) => f.name);
  const [shown, setShown] = useState<string[]>(defaults);
  const [open, setOpen] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);
  // 하이드레이션 완료 플래그를 state 로 둔다(ref 아님) — 저장 effect 가 이 커밋 이후에만 돌아
  // 마운트 시 기본값으로 localStorage 를 덮어쓰는 레이스를 막는다(Strict Mode 이중실행 포함).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as string[];
          const valid = saved.filter((n) => fields.some((f) => f.name === n));
          // SSR-안전 하이드레이션: 마운트 후 1회 로드(초기값=기본, 이후 저장분 반영).
          // eslint-disable-next-line react-hooks/set-state-in-effect
          if (valid.length) setShown(valid);
        }
      } catch {
        /* 손상된 캐시 무시 */
      }
    }
    setHydrated(true);
    // fields 는 매 렌더 새 배열 → deps 제외(로드는 storageKey 기준 1회)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(shown));
    } catch {
      /* 무시 */
    }
  }, [storageKey, shown, hydrated]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (name: string) =>
    setShown((prev) =>
      prev.includes(name) ? (prev.length > 1 ? prev.filter((n) => n !== name) : prev) : [...prev, name],
    );
  const reset = () => {
    setShown(defaults());
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* 무시 */
      }
    }
  };

  // config 순서 유지
  const shownFields = visibleFields.filter((f) => shown.includes(f.name));

  const chooser = storageKey ? (
    <div className="relative" ref={chooserRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-field border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <SlidersIcon />
        조건 <span className="tabular-nums text-faint">{shownFields.length}/{visibleFields.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">표시할 조회조건</span>
            <button type="button" onClick={reset} className="text-[11px] text-primary hover:underline">
              기본값
            </button>
          </div>
          <div className="b1w-scroll max-h-72 overflow-y-auto p-1.5">
            {visibleFields.map((f) => {
              const on = shown.includes(f.name);
              return (
                <label
                  key={f.name}
                  className="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-[13px] hover:bg-surface-2"
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(f.name)} className="accent-primary" />
                  <span className="truncate text-foreground">{f.label}</span>
                </label>
              );
            })}
          </div>
          <p className="border-t border-border px-3 py-1.5 text-[10px] text-faint">이 브라우저에 저장됩니다 (사용자별)</p>
        </div>
      )}
    </div>
  ) : undefined;

  // 조건 선택기는 SearchPanel 폼(overflow-hidden) '밖' 위쪽에 둔다 — 폼 안에 두면 드롭다운이 폼에 잘림.
  return (
    <div>
      {chooser && <div className="mb-1 flex items-center justify-end">{chooser}</div>}
      <SearchPanel>
        {hiddenFields.map((f) => (
          <input key={f.name} type="hidden" name={f.name} value={values[f.name] ?? ""} readOnly />
        ))}
        {shownFields.map((f) =>
          f.kind === "cfl" && f.cflType ? (
            <CflField
              key={f.name}
              label={f.label}
              name={f.name}
              cflType={f.cflType}
              defaultValue={values[f.name] ?? ""}
              placeholder={f.placeholder}
            />
          ) : (
            <SearchField
              key={f.name}
              label={f.label}
              name={f.name}
              type={f.kind === "cfl" || f.kind === "hidden" ? "text" : (f.kind ?? "text")}
              defaultValue={values[f.name] ?? ""}
              placeholder={f.placeholder}
              options={f.options}
            />
          ),
        )}
      </SearchPanel>
    </div>
  );
}

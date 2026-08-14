"use client";

/**
 * FieldSet — 상세화면 헤더(문서정보) 필드 선택기. DataGrid 컬럼선택기와 동일 UX.
 * 서버가 label+node(값) 목록을 넘기면, 사용자가 표시할 필드를 골라 localStorage 에 저장(사용자별·화면별).
 * defaultHidden 필드는 초기 숨김(사용자가 켤 수 있음). 최소 1개는 유지.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card, CardBody } from "@/components/ui";
import { InfoField } from "./InfoField";

export type FieldDef = { key: string; label: string; node: ReactNode; defaultHidden?: boolean };

function FieldsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18M3 12h18M3 19h12" />
    </svg>
  );
}

export function FieldSet({
  fields,
  storageKey,
  title = "문서 정보",
}: {
  fields: FieldDef[];
  storageKey: string;
  title?: string;
}) {
  const defaultsHidden = () => new Set(fields.filter((f) => f.defaultHidden).map((f) => f.key));
  const [hidden, setHidden] = useState<Set<string>>(defaultsHidden);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 하이드레이션 완료 플래그를 state 로(ref 아님) — 저장 effect 가 이 커밋 이후에만 돌아
  // 마운트 시 기본값 덮어쓰기 레이스를 막는다(Strict Mode 포함).
  const [hydrated, setHydrated] = useState(false);

  // 사용자 선택 로드 (SSR 안전: 마운트 후) — 손상 캐시 무시
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw) as { hidden?: string[] };
        if (Array.isArray(p.hidden)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHidden(new Set(p.hidden));
        }
      }
    } catch {
      /* 무시 */
    }
    setHydrated(true);
  }, [storageKey]);

  // 변경분 저장 (하이드레이션 완료 후에만)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ hidden: [...hidden] }));
    } catch {
      /* 무시 */
    }
  }, [storageKey, hidden, hydrated]);

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const shown = fields.filter((f) => !hidden.has(f.key));
  const toggle = (key: string) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
      } else {
        if (fields.length - n.size <= 1) return prev; // 최소 1개 유지
        n.add(key);
      }
      return n;
    });
  const reset = () => {
    setHidden(defaultsHidden());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* 무시 */
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="relative shrink-0" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-field border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <FieldsIcon />
            필드 <span className="tabular-nums text-faint">{shown.length}/{fields.length}</span>
          </button>
          {open && (
            <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-card border border-border bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold text-foreground">표시할 필드</span>
                <button type="button" onClick={reset} className="text-[11px] text-primary hover:underline">
                  기본값
                </button>
              </div>
              <div className="c4-scroll max-h-72 overflow-y-auto p-1.5">
                {fields.map((f) => {
                  const on = !hidden.has(f.key);
                  return (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-[13px] hover:bg-surface-2"
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(f.key)} className="accent-primary" />
                      <span className="truncate text-foreground">{f.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="border-t border-border px-3 py-1.5 text-[10px] text-faint">이 브라우저에 저장됩니다 (사용자별)</p>
            </div>
          )}
        </div>
      </div>
      <CardBody>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((f) => (
            <InfoField key={f.key} label={f.label}>
              {f.node}
            </InfoField>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

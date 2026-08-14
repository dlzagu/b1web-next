"use client";

/**
 * 생성폼 ↔ 상세 컬럼선택 동기화 + UDF 입력 (client 공용).
 * 상세화면(DataGrid 라인 / FieldSet 헤더)이 localStorage 에 저장한 "표시할 컬럼/필드" 선택을
 * 생성폼이 읽어, 켠 것만 입력칸으로 노출한다(UDF 포함). 저장키·포맷은 상세와 동일:
 *   - 라인 컬럼: b1w:cols:<ns>-detail:<uid>  → { visibility: {key:boolean}, order, sizing }
 *   - 헤더 필드: c4:hdr:<ns>:<uid>          → { hidden: string[] }
 * (rules.md [★DRY-공통함수화] / [★문서화면 필드선택+UDF] / [★문서화면 설정주입 통일])
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui";

/** UDF 정의(클라 전달용) — udf.ts UdfDef 의 client 미러(server-only 회피) */
export type UdfDefC = { alias: string; column: string; label: string; typeId: string };

/** CUFD TypeID → 입력 컨트롤 타입 (A=문자, N=숫자, D=날짜, B=일반) */
export function udfInputType(typeId: string): "date" | "number" | "text" {
  return typeId === "D" ? "date" : typeId === "N" ? "number" : "text";
}

/**
 * 라인 컬럼 표시여부 판정기 — 상세 DataGrid 저장(visibility) 기준.
 * 저장값이 없거나(미방문) 해당 키 미저장이면 defaultVisible 로. SSR/하이드레이션 안전(마운트 후 반영).
 */
export function useLineColVisible(storageNs: string, uid: string): (key: string, defaultVisible?: boolean) => boolean {
  const [state, setState] = useState<{ vis: Record<string, boolean>; saved: boolean } | null>(null);
  useEffect(() => {
    let next: { vis: Record<string, boolean>; saved: boolean } = { vis: {}, saved: false };
    try {
      const raw = localStorage.getItem(`b1w:cols:${storageNs}-detail:${uid}`);
      if (raw) {
        const p = JSON.parse(raw) as { visibility?: Record<string, boolean> };
        next = { vis: p.visibility ?? {}, saved: true };
      }
    } catch {
      /* 손상 캐시 무시 → default */
    }
    // 마운트 후 1회 로드(외부 저장소 동기화) — FieldSet/DataTableClient 와 동일 패턴
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, [storageNs, uid]);
  return (key, defaultVisible = true) => {
    if (!state) return defaultVisible; // 하이드레이션 전
    if (state.saved && key in state.vis) return state.vis[key] !== false;
    return defaultVisible;
  };
}

/**
 * 헤더 필드 표시여부 판정기 — 상세 FieldSet 저장(hidden[]) 기준.
 * 저장이 있으면 hidden 에 없는 것만 표시. 없으면 defaultVisible.
 */
export function useHeaderFieldVisible(storageNs: string, uid: string): (key: string, defaultVisible?: boolean) => boolean {
  const [state, setState] = useState<{ hidden: Set<string>; saved: boolean } | null>(null);
  useEffect(() => {
    let next: { hidden: Set<string>; saved: boolean } = { hidden: new Set(), saved: false };
    try {
      const raw = localStorage.getItem(`c4:hdr:${storageNs}:${uid}`);
      if (raw) {
        const p = JSON.parse(raw) as { hidden?: string[] };
        next = { hidden: new Set(p.hidden ?? []), saved: true };
      }
    } catch {
      /* 손상 캐시 무시 → default */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, [storageNs, uid]);
  return (key, defaultVisible = true) => {
    if (!state) return defaultVisible;
    if (state.saved) return !state.hidden.has(key);
    return defaultVisible;
  };
}

/** UDF 입력 컨트롤 (타입별 date/number/text). 값은 문자열 상태로 관리. */
export function UdfInput({
  def,
  value,
  onChange,
  className,
}: {
  def: UdfDefC;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Input
      type={udfInputType(def.typeId)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.label}
      className={className}
    />
  );
}

/** UDF 값 맵에서 빈값 제거(선택) — 필요 시 사용. 현재는 전량 전송(수정 시 클리어 의도 보존). */
export function nonEmptyUdf(udf: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(udf).filter(([, v]) => v !== ""));
}

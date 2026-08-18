import "server-only";

/**
 * 사용자정의필드(UDF, U_*) 동적 로더 — CUFD(사용자필드 정의)에서 테이블별 UDF 목록을 읽는다.
 * 화면 정의를 DB에서 읽는 데이터구동 방식. 상세화면 필드/컬럼 선택기 풀에 사용.
 */
import { query } from "@/lib/db/hana";

export type UdfDef = {
  /** CUFD AliasID (U_ 접두 제외) */
  alias: string;
  /** 실제 컬럼명 U_<alias> */
  column: string;
  /** 한글 라벨 (CUFD.Descr) */
  label: string;
  /** CUFD TypeID (A=문자, N=숫자, D=날짜, B=일반) */
  typeId: string;
};

const IDENT_RE = /^[A-Za-z0-9_]+$/;

/** 테이블의 UDF 목록 (CUFD 정의 기준). 실패/없음이면 빈 배열. */
export async function loadTableUdfs(tableId: string): Promise<UdfDef[]> {
  if (!IDENT_RE.test(tableId)) return [];
  try {
    const rows = await query<{ AliasID: string; Descr: string | null; TypeID: string }>(
      `SELECT "AliasID", "Descr", "TypeID" FROM "CUFD" WHERE "TableID" = ? ORDER BY "AliasID"`,
      [tableId],
    );
    return rows
      .filter((r) => IDENT_RE.test(r.AliasID))
      .map((r) => ({
        alias: r.AliasID,
        column: `U_${r.AliasID}`,
        label: r.Descr?.trim() || `U_${r.AliasID}`,
        typeId: r.TypeID,
      }));
  } catch {
    return [];
  }
}

/**
 * UDF 컬럼들을 SELECT 절 조각으로 변환 (앞에 ", " 포함, 없으면 빈 문자열).
 * 날짜형(D)은 TO_VARCHAR. tableAlias = 쿼리 내 테이블 별칭(예 'o','l'). 컬럼명은 CUFD 정의라 안전.
 */
export function udfSelectFragment(udfs: UdfDef[], tableAlias: string): string {
  if (!udfs.length) return "";
  const parts = udfs.map((u) =>
    u.typeId === "D"
      ? `TO_VARCHAR(${tableAlias}."${u.column}",'YYYY-MM-DD') AS "${u.column}"`
      : `${tableAlias}."${u.column}" AS "${u.column}"`,
  );
  return ", " + parts.join(", ");
}

/** UDF 값 표시 문자열 (빈값은 "-") */
export function udfText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

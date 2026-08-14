/**
 * 조회 게이트웨이 (서버 전용 — 읽기 전용).
 *
 * 포트폴리오 전환(ADR: docs/decisions) — 실서버 HANA 를 데모 SQLite 로 교체했다.
 * **공개 인터페이스(query/queryOne/헬스체크)와 read-only 가드는 그대로 유지**하고,
 * HANA 문법(TO_VARCHAR·TO_DECIMAL·DAYS_BETWEEN·SELECT TOP)은 어댑터가 흡수한다
 * (src/lib/db/sqlite.ts) — 그래서 화면 30여 개의 쿼리를 한 줄도 고치지 않았다.
 *
 * 설계 원칙 (CLAUDE.md):
 * - 조회 경로 = 이 게이트웨이 단일 통로. SELECT / WITH / CALL(화이트리스트) 만 허용
 * - 쓰기는 여기로 못 지나간다 — 문서 생성·수정·취소는 로컬 ERP 엔진(src/lib/sl/) 경유
 */
import { getDb, translateHanaSql, dbMode } from "./sqlite";
import { callDemoProc, isDemoProc } from "./procImpl";

// ── 읽기 전용 가드 ───────────────────────────────────────────
/** SELECT / WITH / CALL(화이트리스트) 만 허용. 그 외 키워드는 즉시 거부. */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|REPLACE|EXEC(UTE)?\s+IMMEDIATE)\b/i;
const CALL_WHITELIST = /^CALL\s+"?CF_/i;

export class ReadOnlyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyViolation";
  }
}

/** 세미콜론으로 다중문 차단 + 위험 키워드 차단 + CALL 화이트리스트 */
function assertReadOnly(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, ""); // 끝 세미콜론 1개까지는 허용
  if (/;/.test(trimmed)) {
    throw new ReadOnlyViolation("다중 SQL 문 금지 (세미콜론 구분)");
  }
  const head = trimmed.replace(/^\(+/, "").trimStart().toUpperCase();
  const isSelect = head.startsWith("SELECT") || head.startsWith("WITH");
  const isCall = head.startsWith("CALL");
  if (!isSelect && !isCall) {
    throw new ReadOnlyViolation(
      `읽기 전용 게이트웨이 — SELECT/WITH/CALL 만 허용 (받은 문장 시작: ${head.slice(0, 12)})`,
    );
  }
  if (isSelect && FORBIDDEN.test(trimmed)) {
    throw new ReadOnlyViolation("SELECT 문 내 DML/DDL 키워드 감지 — 거부");
  }
  if (isCall && !CALL_WHITELIST.test(trimmed)) {
    throw new ReadOnlyViolation(
      "CALL 은 CF_ prefix 프로시저만 허용 (조회용 화이트리스트)",
    );
  }
}

/** `CALL "CF_XXX"(?,?,…)` 에서 프로시저명 추출 */
const CALL_NAME_RE = /^CALL\s+"?([A-Za-z0-9_]+)"?\s*\(/i;

// ── 조회 API ─────────────────────────────────────────────────
/**
 * 읽기 전용 SQL 실행. SELECT/WITH/CALL(CF_)만 허용.
 * @returns 행 배열 (컬럼명 → 값 객체)
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = [],
): Promise<T[]> {
  assertReadOnly(sql);
  const trimmed = sql.trim().replace(/;+\s*$/, "");

  // 프로시저 호출은 SQLite 에 없다 → 동일 결과 계약의 TS 구현으로 위임
  const call = CALL_NAME_RE.exec(trimmed);
  if (call) {
    const name = call[1];
    if (!isDemoProc(name)) {
      throw new ReadOnlyViolation(`구현되지 않은 프로시저입니다: ${name}`);
    }
    return callDemoProc(name, params) as T[];
  }

  return getDb()
    .prepare(translateHanaSql(trimmed))
    .all(...params) as T[];
}

/** 단일 행 (없으면 null) */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 헬스체크 — 회사명 조회로 데모 DB 상태 확인 */
export async function hanaHealthCheck(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const row = await queryOne<{ CompnyName: string }>(
      `SELECT "CompnyName" FROM OADM`,
    );
    const docs = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "ORDR"`,
    );
    return {
      ok: true,
      detail: `데모 DB 정상 (${dbMode() === "memory" ? "메모리" : "파일"} · 회사: ${row?.CompnyName ?? "?"} · 판매오더 ${docs?.n ?? 0}건)`,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

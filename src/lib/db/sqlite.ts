/**
 * SQLite 데모 DB 코어 (포트폴리오 전환 — 실서버 HANA 대체).
 *
 * - 로컬: .data/b1web.db 파일. 없으면 첫 접속 때 스키마 생성 + 가상 시드 (npm run db:reset 로 재생성)
 * - 서버리스(Vercel): 파일시스템이 read-only 라 :memory: — 콜드스타트마다 즉석 시드
 * - HANA 호환 계층: 화면 쿼리가 HANA 문법(TO_VARCHAR·TO_DECIMAL·DAYS_BETWEEN·TOP)을
 *   그대로 쓰도록 커스텀 SQL 함수 등록 + TOP→LIMIT 재작성. 화면 코드는 손대지 않는다.
 *
 * ⚠️ 쓰기는 이 모듈을 직접 쓰는 로컬 ERP 엔진(src/lib/sl/localErp.ts)과 시드 생성기만 한다.
 *    화면 조회는 read-only 게이트웨이(./hana.ts)를 경유한다.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureSeed } from "./demo-seed/generate";

export type DemoDb = InstanceType<typeof Database>;

function dbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.VERCEL) return ":memory:";
  return path.join(process.cwd(), ".data", "b1web.db");
}

/** HANA 호환 스칼라 함수 — 화면 쿼리의 HANA 문법을 그대로 살린다 */
function registerHanaCompat(db: DemoDb): void {
  db.function(
    "TO_VARCHAR",
    { deterministic: true, varargs: true },
    (...args: unknown[]) => {
      const [v, fmt] = args;
      if (v === null || v === undefined) return null;
      const s = String(v);
      if (typeof fmt === "string") {
        const f = fmt.toUpperCase();
        if (f === "YYYY-MM-DD") return s.slice(0, 10);
        if (f === "YYYY-MM") return s.slice(0, 7);
        if (f === "YYYYMMDD") return s.slice(0, 10).replace(/-/g, "");
        return s;
      }
      return s;
    },
  );
  db.function(
    "TO_DECIMAL",
    { deterministic: true, varargs: true },
    (...args: unknown[]) => {
      const v = args[0];
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
  );
  // HANA DAYS_BETWEEN(d1, d2) = d1→d2 일수 (d2 - d1)
  db.function(
    "DAYS_BETWEEN",
    { deterministic: true },
    (d1: unknown, d2: unknown) => {
      if (d1 == null || d2 == null) return null;
      const a = Date.parse(String(d1).slice(0, 10));
      const b = Date.parse(String(d2).slice(0, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Math.round((b - a) / 86_400_000);
    },
  );
}

const TOP_RE = /\bSELECT\s+TOP\s+(\d+)\b/gi;

/**
 * 문자열 리터럴('…')과 주석(--, /* *\/)을 같은 길이의 공백으로 덮은 사본.
 * 위치가 보존되므로 이 사본에서 찾은 인덱스를 원문에 그대로 쓸 수 있다.
 * (리터럴 안의 `TOP`·주석 안의 `TOP` 을 코드로 오인하지 않기 위함)
 */
function maskLiterals(sql: string): string {
  const out = sql.split("");
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      for (let k = i; k <= Math.min(j, sql.length - 1); k++)
        if (out[k] !== "\n") out[k] = " ";
      i = j + 1;
    } else if (two === "--") {
      let j = i;
      while (j < sql.length && sql[j] !== "\n") out[j++] = " ";
      i = j;
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const j = end < 0 ? sql.length : end + 2;
      for (let k = i; k < j; k++) if (out[k] !== "\n") out[k] = " ";
      i = j;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * HANA `SELECT TOP n` → SQLite `SELECT … LIMIT n` 재작성.
 *
 * 🔴 조용한 오변환을 막는 것이 이 함수의 핵심 책임이다:
 *  - 문자열 리터럴·주석 안의 TOP 은 건드리지 않는다 (마스킹 사본에서만 탐색)
 *  - **최외곽 SELECT 의 TOP 만** 허용한다. 서브쿼리/CTE/UNION 뒤의 TOP 은 최외곽 LIMIT 으로
 *    끌어올리면 결과가 달라지므로 변환하지 않고 던진다.
 *  - LIMIT 은 개행과 함께 붙인다 — 끝이 라인주석(`-- …`)이면 같은 줄에 붙어 무력화된다.
 */
export function translateHanaSql(sql: string): string {
  const cleaned = sql.replace(/;+\s*$/, "");
  const masked = maskLiterals(cleaned);
  const matches = [...masked.matchAll(TOP_RE)];
  if (matches.length === 0) return cleaned;
  if (matches.length > 1) {
    throw new Error(
      "TOP 이 여러 번 쓰인 쿼리는 자동 변환하지 않습니다 — LIMIT 으로 수동 변환하세요",
    );
  }
  const m = matches[0];
  const start = m.index ?? 0;

  /** 위치 i 의 괄호 깊이 (마스킹 사본 기준이라 리터럴·주석 속 괄호는 세지 않는다) */
  const depthAt = (i: number): number => {
    let d = 0;
    for (let k = 0; k < i; k++) {
      if (masked[k] === "(") d++;
      else if (masked[k] === ")") d--;
    }
    return d;
  };

  // TOP 이 서브쿼리 안이면(깊이>0) 최외곽 LIMIT 으로 끌어올릴 수 없다.
  // ⚠️ '앞에 ( 가 있는가'로 판정하면 안 된다 — CTE(WITH x AS (...))나 FROM (…) 서브쿼리처럼
  //    이미 닫힌 괄호가 앞에 있어도 TOP 자체는 최외곽일 수 있다(W3100 이 그 예).
  if (depthAt(start) > 0) {
    throw new Error(
      "서브쿼리 안의 TOP 은 자동 변환하지 않습니다 — LIMIT 으로 수동 변환하세요",
    );
  }

  // 최외곽(깊이 0)에서 집합연산이 이어지면 LIMIT 이 결합 결과 전체에 걸려 의미가 달라진다.
  // 괄호 안(깊이>0)의 UNION 은 서브쿼리 내부이므로 무해하다.
  const setOpRe = /\b(UNION|INTERSECT|EXCEPT)\b/gi;
  for (const op of masked.matchAll(setOpRe)) {
    const at = op.index ?? 0;
    if (at > start && depthAt(at) === 0) {
      throw new Error(
        "최외곽 UNION 과 함께 쓰인 TOP 은 자동 변환하지 않습니다 — LIMIT 으로 수동 변환하세요",
      );
    }
  }
  const rewritten =
    cleaned.slice(0, start) + "SELECT" + cleaned.slice(start + m[0].length);
  return `${rewritten}\nLIMIT ${m[1]}`;
}

// dev HMR 마다 커넥션·시드가 반복되지 않게 전역 캐시
const g = globalThis as unknown as { __b1webDb?: DemoDb };

export function getDb(): DemoDb {
  if (g.__b1webDb) return g.__b1webDb;
  const p = dbPath();
  if (p !== ":memory:") {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
  const db = new Database(p);
  if (p !== ":memory:") db.pragma("journal_mode = WAL");
  registerHanaCompat(db);
  // ⚠️ 시드가 로컬 ERP 엔진(getDb 재진입)을 쓰므로 캐시를 먼저 채운다
  g.__b1webDb = db;
  try {
    ensureSeed(db);
  } catch (e) {
    // 커넥션을 닫지 않으면 WAL 핸들이 남아 .data 삭제(db:reset)가 실패한다
    g.__b1webDb = undefined;
    columnCache.clear();
    try {
      db.close();
    } catch {
      /* 닫기 실패는 원인 예외를 가리지 않게 무시 */
    }
    throw e;
  }
  return db;
}

export function dbMode(): "file" | "memory" {
  return dbPath() === ":memory:" ? "memory" : "file";
}

/** 명시적 종료 (스크립트·테스트용) */
export function closeDb(): void {
  if (g.__b1webDb) {
    g.__b1webDb.close();
    g.__b1webDb = undefined;
  }
  // 다른 DB 를 다시 열 때 이전 스키마의 컬럼 집합이 재사용되면 안 된다
  columnCache.clear();
}

/** 테이블 실컬럼 목록 (UDF 동적 키 필터링용) — 엔진·시드가 사용 */
const columnCache = new Map<string, Set<string>>();
export function tableColumns(db: DemoDb, table: string): Set<string> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = db
    .prepare(`SELECT name FROM pragma_table_info(?)`)
    .all(table) as { name: string }[];
  const set = new Set(rows.map((r) => r.name));
  columnCache.set(table, set);
  return set;
}

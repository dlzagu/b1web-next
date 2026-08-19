/**
 * 데모 DB 코어 (포트폴리오 전환 — 실서버 HANA 대체).
 *
 * 드라이버는 **libSQL**(`libsql` 패키지 — better-sqlite3 호환 동기 API)이다. 같은 코드로
 * 로컬 파일·메모리·원격(Turso)을 모두 연다:
 *  - 로컬:            `.data/b1web.db` 파일. 없으면 첫 접속 때 스키마 생성 + 가상 시드
 *  - 스모크/테스트:    `DATABASE_PATH=:memory:`
 *  - 배포(공유 DB):    `TURSO_DATABASE_URL` 이 있으면 원격 — 모든 인스턴스가 같은 DB 를 본다
 *                     → 생성한 문서가 다음 요청·다른 인스턴스에서도 남는다(ADR-0002)
 *
 * 🔴 원격에서는 **자동 시드를 하지 않는다.** 시드는 문서를 ERP 엔진으로 200여 건 만드는
 *    무거운 작업이라 콜드스타트마다 돌면 함수 타임아웃이고, 동시 콜드스타트가 겹치면 경합한다.
 *    원격 시드·주기적 리셋은 `npm run turso:reset`(GitHub Actions 크론)이 전담한다.
 *
 * 🔴 HANA 호환은 **SQL 재작성**으로 한다 — 커스텀 스칼라 함수 등록(`db.function`)은
 *    libSQL 에서 "not implemented" 로 던진다(타입 정의에는 있지만 런타임에 없다). 원격은
 *    애초에 SQL 이 서버에서 실행되므로 JS 함수를 심을 자리가 없다. 그래서 TO_VARCHAR·
 *    TO_DECIMAL·DAYS_BETWEEN 을 순수 SQLite 식으로 바꿔 넣는다 → **화면 쿼리는 무수정**.
 *
 * ⚠️ 쓰기는 이 모듈을 직접 쓰는 로컬 ERP 엔진(src/lib/sl/localErp.ts)과 시드 생성기만 한다.
 *    화면 조회는 read-only 게이트웨이(./hana.ts)를 경유한다.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "libsql";
import { ensureSeed } from "./demo-seed/generate";

export type DemoDb = InstanceType<typeof Database>;

export type DbTarget =
  | { mode: "remote"; url: string; authToken?: string }
  | { mode: "file"; url: string }
  | { mode: "memory"; url: ":memory:" };

/** 접속 대상 결정 — 공유 DB(원격)가 있으면 그쪽이 정본이다 */
export function dbTarget(): DbTarget {
  const remote = process.env.TURSO_DATABASE_URL?.trim();
  if (remote) {
    return { mode: "remote", url: remote, authToken: process.env.TURSO_AUTH_TOKEN?.trim() };
  }
  const explicit = process.env.DATABASE_PATH;
  if (explicit) {
    return explicit === ":memory:"
      ? { mode: "memory", url: ":memory:" }
      : { mode: "file", url: explicit };
  }
  // 서버리스는 배포 파일시스템이 read-only → 공유 DB 가 없으면 인스턴스 메모리
  if (process.env.VERCEL) return { mode: "memory", url: ":memory:" };
  return { mode: "file", url: path.join(process.cwd(), ".data", "b1web.db") };
}

/** 모든 인스턴스가 같은 데이터를 보는가 — 쓰기 데모가 유지되는지의 근거 */
export function isSharedDb(): boolean {
  return dbTarget().mode === "remote";
}

// ── HANA 호환: 문자열 마스킹 ────────────────────────────────
/**
 * 문자열 리터럴('…')과 주석(--, 블록주석)을 같은 길이의 공백으로 덮은 사본.
 * 위치가 보존되므로 이 사본에서 찾은 인덱스를 원문에 그대로 쓸 수 있다.
 * (리터럴·주석 안의 `TOP`·`TO_VARCHAR` 를 코드로 오인하지 않기 위함)
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

// ── HANA 호환: 스칼라 함수 → 순수 SQLite 식 ──────────────────
/** 최상위 콤마로만 인자를 쪼갠다 — 중첩 괄호·리터럴 속 콤마는 무시 */
function splitArgs(raw: string, maskedRaw: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < maskedRaw.length; i++) {
    const c = maskedRaw[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      args.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(raw.slice(start).trim());
  return args.map((a) => a.trim()).filter((a, i, arr) => !(arr.length === 1 && a === ""));
}

/** 리터럴 인자에서 따옴표를 벗긴다 ('YYYY-MM' → YYYY-MM). 리터럴이 아니면 null */
function literal(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = /^'([\s\S]*)'$/.exec(arg.trim());
  return m ? m[1].replace(/''/g, "'") : null;
}

/**
 * HANA 스칼라 함수를 순수 SQLite 식으로 치환한다.
 *
 * 값 의미는 종전 JS 구현과 같게 맞췄다:
 *  · TO_VARCHAR(d,'YYYY-MM-DD') → 앞 10자   · 'YYYY-MM' → 앞 7자   · 'YYYYMMDD' → 하이픈 제거
 *  · TO_VARCHAR(x)              → 문자열 캐스팅 (포맷 없음/미지원 포맷도 동일)
 *  · TO_DECIMAL(v[,p,s])        → 숫자 캐스팅. 정밀도·스케일은 종전 구현도 무시했다(반올림 없음)
 *  · DAYS_BETWEEN(d1,d2)        → d2 − d1 일수
 * NULL 은 SQLite 함수들이 그대로 NULL 을 전파하므로 종전과 같다.
 */
const HANA_FNS = ["TO_VARCHAR", "TO_DECIMAL", "DAYS_BETWEEN"] as const;

function buildReplacement(name: string, args: string[]): string {
  const a0 = args[0] ?? "NULL";
  if (name === "TO_DECIMAL") return `CAST(${a0} AS REAL)`;
  if (name === "DAYS_BETWEEN") {
    const a1 = args[1] ?? "NULL";
    return `CAST(julianday(substr(${a1},1,10)) - julianday(substr(${a0},1,10)) AS INTEGER)`;
  }
  // TO_VARCHAR
  const fmt = literal(args[1])?.toUpperCase();
  if (fmt === "YYYY-MM-DD") return `substr(${a0},1,10)`;
  if (fmt === "YYYY-MM") return `substr(${a0},1,7)`;
  if (fmt === "YYYYMMDD") return `replace(substr(${a0},1,10),'-','')`;
  return `CAST(${a0} AS TEXT)`;
}

function rewriteHanaFunctions(sql: string): string {
  let out = sql;
  // 바깥쪽부터 한 번에 하나씩 치환하고 다시 훑는다 — 중첩(TO_DECIMAL(COALESCE(…)) 등)이
  // 있어도 다음 패스에서 안쪽이 잡힌다. 상한은 폭주 방지용.
  for (let pass = 0; pass < 200; pass++) {
    const masked = maskLiterals(out);
    let found: { name: string; open: number; close: number } | null = null;
    for (const name of HANA_FNS) {
      const re = new RegExp(`\\b${name}\\s*\\(`, "i");
      const m = re.exec(masked);
      if (!m) continue;
      const open = m.index + m[0].length - 1; // '(' 위치
      let depth = 0;
      let close = -1;
      for (let i = open; i < masked.length; i++) {
        if (masked[i] === "(") depth++;
        else if (masked[i] === ")") {
          depth--;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      if (close < 0) continue; // 괄호가 안 닫힌 SQL — 건드리지 않고 DB 에 맡긴다
      if (!found || m.index < found.open) found = { name, open: m.index, close };
    }
    if (!found) return out;
    const openParen = out.indexOf("(", found.open);
    const inner = out.slice(openParen + 1, found.close);
    const innerMasked = maskLiterals(out).slice(openParen + 1, found.close);
    const repl = buildReplacement(found.name.toUpperCase(), splitArgs(inner, innerMasked));
    out = out.slice(0, found.open) + repl + out.slice(found.close + 1);
  }
  return out;
}

const TOP_RE = /\bSELECT\s+TOP\s+(\d+)\b/gi;

/**
 * HANA 문법 → SQLite 재작성. `SELECT TOP n` → `LIMIT n`, HANA 스칼라 함수 → 순수 식.
 *
 * 🔴 조용한 오변환을 막는 것이 이 함수의 핵심 책임이다:
 *  - 문자열 리터럴·주석 안의 TOP/함수명은 건드리지 않는다 (마스킹 사본에서만 탐색)
 *  - **최외곽 SELECT 의 TOP 만** 허용한다. 서브쿼리/CTE/UNION 뒤의 TOP 은 최외곽 LIMIT 으로
 *    끌어올리면 결과가 달라지므로 변환하지 않고 던진다.
 *  - LIMIT 은 개행과 함께 붙인다 — 끝이 라인주석(`-- …`)이면 같은 줄에 붙어 무력화된다.
 */
export function translateHanaSql(sql: string): string {
  const cleaned = sql.replace(/;+\s*$/, "");
  const masked = maskLiterals(cleaned);
  const matches = [...masked.matchAll(TOP_RE)];
  if (matches.length > 1) {
    throw new Error(
      "TOP 이 여러 번 쓰인 쿼리는 자동 변환하지 않습니다 — LIMIT 으로 수동 변환하세요",
    );
  }
  if (matches.length === 0) return rewriteHanaFunctions(cleaned);
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
  //    이미 닫힌 괄호가 앞에 있어도 TOP 자체는 최외곽일 수 있다(일일 업무 요약 화면이 그 예).
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
  return `${rewriteHanaFunctions(rewritten)}\nLIMIT ${m[1]}`;
}

// dev HMR 마다 커넥션·시드가 반복되지 않게 전역 캐시
const g = globalThis as unknown as { __b1webDb?: DemoDb };

/**
 * 커넥션 생성 — **모듈 내부 전용**.
 * 🔴 밖에서 부르면 안 된다. 시드·엔진이 `getDb()` 로 전역 캐시된 커넥션을 다시 찾기 때문에,
 *    캐시를 채우지 않는 이 함수로 연 커넥션에 스키마를 만들면 엔진은 **다른 커넥션**을 열어
 *    "no such table" 로 터진다(리셋 스크립트에서 실제로 밟았다). 항상 getDb() 를 쓸 것.
 */
function openDb(): DemoDb {
  const t = dbTarget();
  if (t.mode === "file") fs.mkdirSync(path.dirname(t.url), { recursive: true });
  // ⚠️ `authToken` 은 libsql 런타임이 받는데 타입 정의(Options)에는 빠져 있다(0.5.29 기준).
  //    타입만 믿고 syncUrl 등으로 우회하면 인증이 안 붙으므로, 여기서만 캐스팅해 넘긴다.
  const db =
    t.mode === "remote"
      ? new Database(t.url, { authToken: t.authToken } as ConstructorParameters<typeof Database>[1])
      : new Database(t.url);
  if (t.mode === "file") db.pragma("journal_mode = WAL");
  return db;
}

export function getDb(): DemoDb {
  if (g.__b1webDb) return g.__b1webDb;
  const t = dbTarget();
  const db = openDb();
  // ⚠️ 시드가 로컬 ERP 엔진(getDb 재진입)을 쓰므로 캐시를 먼저 채운다
  g.__b1webDb = db;
  // 원격(공유 DB)은 런타임에 시드하지 않는다 — 무겁고 동시 콜드스타트가 경합한다.
  // 시드·리셋은 npm run turso:reset 전담. (헬스체크가 미시드 상태를 알려준다)
  if (t.mode === "remote") return db;
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

export function dbMode(): DbTarget["mode"] {
  return dbTarget().mode;
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

// ── 중첩 안전 트랜잭션 ──────────────────────────────────────
let savepointSeq = 0;

/**
 * 트랜잭션 실행. **이미 트랜잭션 안이면 SAVEPOINT 로 중첩**한다.
 *
 * 🔴 libSQL 은 BEGIN 중첩을 거부한다 — "cannot start a transaction within a transaction".
 *    better-sqlite3 는 중첩을 감지해 알아서 SAVEPOINT 를 썼기 때문에, 시드(바깥 트랜잭션)가
 *    ERP 엔진(안쪽 트랜잭션)을 호출하는 우리 구조가 그냥 동작했다. 드라이버를 바꾸면서 그
 *    편의가 사라졌으므로 여기서 명시적으로 재현한다 — 원자성 의미는 종전과 같다
 *    (안쪽이 실패하면 그 지점까지만 되돌리고 예외를 그대로 올린다).
 */
export function runInTransaction<T>(db: DemoDb, fn: () => T): T {
  if (!db.inTransaction) return db.transaction(fn).immediate() as T;
  const sp = `b1w_sp_${(savepointSeq += 1)}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const out = fn();
    db.exec(`RELEASE ${sp}`);
    return out;
  } catch (e) {
    db.exec(`ROLLBACK TO ${sp}`);
    db.exec(`RELEASE ${sp}`);
    throw e;
  }
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

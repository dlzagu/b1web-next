/**
 * 공유 DB(Turso) 초기화 — 전체 삭제 후 가상 시드를 다시 만든다.
 *
 *   npm run turso:reset            # .env.turso 를 읽어 실행
 *   TURSO_DATABASE_URL=… npm run turso:reset
 *
 * 왜 필요한가: 배포본은 모든 방문자가 **같은 DB** 를 본다. 데모로 문서를 만들거나 취소한
 * 흔적이 쌓이면 README 에 적힌 수치·스크린샷과 어긋나고, 마음먹으면 데이터를 비울 수도 있다.
 * 그래서 하루 한 번 이 스크립트로 원상복구한다(.github/workflows/turso-reset.yml).
 *
 * 🔴 **로컬에서 만들고 통째로 밀어 넣는다.** 시드는 ERP 엔진으로 문서를 200여 건 만드는
 *    작업이라 문장 수가 수천 개다. 원격 커넥션에 그대로 태우면 왕복 지연이 곱해져 10분이
 *    지나도 안 끝난다(실제로 밟았다). 그래서 ① 메모리 DB 에 초 단위로 시드하고
 *    ② 결과를 SQL 로 덤프해 ③ 수백 문장씩 묶어 보낸다 → 왕복이 수천 번에서 수십 번으로 준다.
 *
 * 🔴 원격이 아니면 **아무것도 하지 않는다.** 로컬 파일을 실수로 날리지 않기 위한 가드다
 *    (로컬 초기화는 `npm run db:reset`).
 */
import fs from "node:fs";
import path from "node:path";

/** .env 형식 파일을 읽어 아직 없는 키만 채운다 (CI 는 시크릿으로 이미 주입돼 있다) */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

/** SQL 리터럴 — 문자열은 작은따옴표를 겹쳐 이스케이프한다 */
function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

const BATCH = 400; // 한 번에 보낼 문장 수 — 왕복 횟수와 페이로드 크기의 절충

async function main(): Promise<void> {
  loadEnvFile(path.join(process.cwd(), ".env.turso"));

  const sqliteMod = "../src/lib/db/sqlite";
  const { dbTarget } = await import(sqliteMod);
  const target = dbTarget();
  if (target.mode !== "remote") {
    console.error(
      `[turso:reset] 중단 — 접속 대상이 '${target.mode}' 입니다. 이 스크립트는 공유 DB(원격) 전용입니다.\n` +
        `             TURSO_DATABASE_URL 을 설정하세요. 로컬 초기화는 npm run db:reset 입니다.`,
    );
    process.exit(1);
  }
  // 토큰·전체 좌표는 출력하지 않는다
  console.log(`[turso:reset] 대상: ${target.url.replace(/^(\w+:\/\/[^.]{0,8}).*$/, "$1…")}`);

  // ── ① 메모리 DB 에 시드 (엔진이 전역 커넥션을 다시 찾으므로 getDb 로 연다) ──
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  const remoteToken = process.env.TURSO_AUTH_TOKEN;
  delete process.env.TURSO_DATABASE_URL;
  process.env.DATABASE_PATH = ":memory:";

  const { getDb, closeDb } = await import(sqliteMod);
  const t0 = Date.now();
  const local = getDb(); // getDb 안에서 ensureSeed 가 돈다
  console.log(`[turso:reset] 로컬 시드 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // ── ② 스키마 + 데이터 덤프 ──
  const objects = local
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
        ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END`,
    )
    .all() as { type: string; name: string; sql: string }[];
  const tableNames = objects.filter((o) => o.type === "table").map((o) => o.name);

  const stmts: string[] = objects.map((o) => o.sql);
  let rowCount = 0;
  for (const t of tableNames) {
    const rows = local.prepare(`SELECT * FROM "${t}"`).all() as Record<string, unknown>[];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter((c) => c !== "_metadata");
    const colList = cols.map((c) => `"${c}"`).join(",");
    for (const r of rows) {
      stmts.push(`INSERT INTO "${t}" (${colList}) VALUES (${cols.map((c) => lit(r[c])).join(",")})`);
      rowCount += 1;
    }
  }
  console.log(`[turso:reset] 덤프 — 오브젝트 ${objects.length}개 · ${rowCount}행 · 문장 ${stmts.length}개`);

  closeDb();

  // ── ③ 원격 비우고 배치 적재 ──
  delete process.env.DATABASE_PATH;
  process.env.TURSO_DATABASE_URL = remoteUrl;
  if (remoteToken) process.env.TURSO_AUTH_TOKEN = remoteToken;

  const remote = getDb(); // 원격은 getDb 가 자동 시드를 하지 않는다

  // 🔴 삭제 대상을 **원격 조회 결과에만** 의존하지 않는다. 직전 실행이 남긴 테이블이
  //    sqlite_master 조회에는 아직 안 잡히는데 CREATE 는 "already exists" 로 터지는 상황을
  //    실제로 밟았다(분산 DB 라 쓰기 직후 읽기가 최신이 아닐 수 있다). 그래서
  //    ① 덤프가 만들 이름 전부 + ② 원격이 보고한 이름 을 합집합으로 DROP IF EXISTS 한다.
  const reported = (
    remote
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
  ).map((r) => r.name);
  const toDrop = [...new Set([...tableNames, ...reported])];
  console.log(`[turso:reset] 정리 — DROP 대상 ${toDrop.length}개 (원격 보고 ${reported.length}개)`);
  for (let i = 0; i < toDrop.length; i += BATCH) {
    remote.exec(
      toDrop
        .slice(i, i + BATCH)
        .map((n) => `DROP TABLE IF EXISTS "${n}"`)
        .join(";\n") + ";",
    );
  }

  const t1 = Date.now();
  for (let i = 0; i < stmts.length; i += BATCH) {
    const chunk = stmts.slice(i, i + BATCH);
    remote.exec(chunk.join(";\n") + ";");
    process.stdout.write(`\r[turso:reset] 적재 ${Math.min(i + BATCH, stmts.length)}/${stmts.length}`);
  }
  process.stdout.write("\n");
  console.log(`[turso:reset] 적재 완료 (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

  // ── ④ 결과를 숫자로 확인 — "돌았다"가 아니라 "맞게 들어갔다"까지 본다 ──
  const counts = remote
    .prepare(
      `SELECT (SELECT COUNT(*) FROM "OITM") AS items,
              (SELECT COUNT(*) FROM "OCRD") AS partners,
              (SELECT COUNT(*) FROM "ORDR") AS orders,
              (SELECT COUNT(*) FROM "OINV") AS invoices,
              (SELECT COUNT(*) FROM "OINM") AS ledger,
              (SELECT SUM("DocTotal") FROM "OINV" WHERE "CANCELED"='N') AS sales`,
    )
    .all()[0] as Record<string, number>;
  console.log(
    `[turso:reset] 확인 — 품목 ${counts.items} · 거래처 ${counts.partners} · 판매오더 ${counts.orders} · ` +
      `매출송장 ${counts.invoices} · 재고원장 ${counts.ledger}행 · 매출합 ${Number(counts.sales).toLocaleString()}`,
  );
  if (!counts.orders || !counts.ledger || !counts.sales) {
    console.error("[turso:reset] ❌ 시드가 비어 있습니다 — 실패로 처리합니다");
    process.exit(1);
  }
  closeDb();
}

main().catch((e) => {
  console.error("[turso:reset] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});

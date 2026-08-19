/**
 * 공유 DB(Turso) 점검 — **읽기 전용**. 리셋 직후와 배포 후에 돌린다.
 *
 *   npm run turso:verify
 *
 * 왜 따로 있나: 스모크(erp-smoke)는 문서를 만들고 취소하므로 **공유 DB 에 돌리면 안 된다**.
 * 여기서는 화면이 실제로 쓰는 조회 경로(read-only 게이트웨이 + HANA→SQLite 재작성기)를
 * 원격에 그대로 태워, 네트워크 너머에서도 같은 수치가 나오는지만 확인한다.
 * 특히 TO_VARCHAR·TO_DECIMAL·DAYS_BETWEEN 은 로컬에서 JS 함수로 돌던 것을 SQL 로 바꿔
 * 넣은 것이라, 원격에서 처음으로 진짜 검증된다.
 */
import fs from "node:fs";
import path from "node:path";

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

let failed = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

async function main(): Promise<void> {
  loadEnvFile(path.join(process.cwd(), ".env.turso"));

  const { dbTarget } = await import("../src/lib/db/sqlite");
  if (dbTarget().mode !== "remote") {
    console.error("[turso:verify] 중단 — TURSO_DATABASE_URL 이 없습니다(공유 DB 전용).");
    process.exit(1);
  }
  const { query, hanaHealthCheck } = await import("../src/lib/db/hana");
  const { buildSalesPivotQuery, monthBuckets, sumBuckets } = await import(
    "../src/lib/report/salesPivot"
  );

  console.log("\n[공유 DB 점검]");
  const health = await hanaHealthCheck();
  check("헬스체크", health.ok, health.detail);

  // HANA 스칼라 함수 3종 — 원격에서는 SQL 재작성으로만 성립한다
  const fx = await query<{ m: string; d: string; c: string; n: number; days: number }>(
    `SELECT TO_VARCHAR("DocDate",'YYYY-MM') AS m, TO_VARCHAR("DocDate",'YYYY-MM-DD') AS d,
            TO_VARCHAR("DocDate",'YYYYMMDD') AS c, TO_DECIMAL("DocTotal",19,2) AS n,
            DAYS_BETWEEN("DocDate","DocDueDate") AS days
       FROM "OINV" LIMIT 1`,
  );
  const r = fx[0];
  check("TO_VARCHAR YYYY-MM", /^\d{4}-\d{2}$/.test(String(r?.m)), String(r?.m));
  check("TO_VARCHAR YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(String(r?.d)), String(r?.d));
  check("TO_VARCHAR YYYYMMDD", /^\d{8}$/.test(String(r?.c)), String(r?.c));
  check("TO_DECIMAL", Number(r?.n) > 0, String(r?.n));
  check("DAYS_BETWEEN", Number.isFinite(Number(r?.days)), String(r?.days));

  // SELECT TOP → LIMIT 재작성
  const top = await query<{ DocEntry: number }>(`SELECT TOP 3 "DocEntry" FROM "ORDR"`);
  check("SELECT TOP → LIMIT", top.length === 3, `${top.length}행`);

  // 프로시저 재구현(CF_STOCK) — 게이트웨이 화이트리스트 경로
  const proc = await query(`CALL "CF_STOCK"(?,?,?,?,?,?,?,?)`, ["W", "", "", "", "", "", "", ""]);
  check("CF_STOCK 프로시저", proc.length > 0, `${proc.length}행`);

  // 화면 쿼리 — 매출 피벗의 셀 합 = 헤더 총합 (스모크 [10] 과 같은 등식)
  const span = await query<{ MaxD: string | null }>(
    `SELECT MAX("DocDate") AS "MaxD" FROM "OINV" WHERE "CANCELED" = 'N'`,
  );
  const year = Number(String(span[0]?.MaxD ?? "").slice(0, 4)) || new Date().getFullYear();
  const buckets = monthBuckets(year, 12);
  const { sql, params } = buildSalesPivotQuery({ tab: "partner", year, buckets });
  const pivot = await query<Record<string, unknown>>(sql, params);
  const cells = sumBuckets(pivot, buckets);
  const hdr = await query<{ S: number }>(
    `SELECT SUM(TO_DECIMAL("DocTotal",19,2)) AS "S" FROM "OINV"
      WHERE "CANCELED" = 'N' AND "DocDate" BETWEEN ? AND ?`,
    [`${year}-01-01`, `${year}-12-31`],
  );
  check(
    "매출 피벗 셀 총합 = OINV 헤더 총합",
    Math.abs(cells - Number(hdr[0]?.S ?? 0)) < 0.001,
    `${cells.toLocaleString()} = ${Number(hdr[0]?.S ?? 0).toLocaleString()}`,
  );

  // 재고 — 원장 순증감 = 창고 재고 합
  const stock = await query<{ ledger: number; onhand: number }>(
    `SELECT (SELECT SUM("InQty") - SUM("OutQty") FROM "OINM") AS "ledger",
            (SELECT SUM("OnHand") FROM "OITW") AS "onhand"`,
  );
  check(
    "재고원장 순증감 = 창고재고 합",
    Math.abs(Number(stock[0]?.ledger) - Number(stock[0]?.onhand)) < 0.001,
    `${Number(stock[0]?.onhand).toLocaleString()}`,
  );

  console.log(failed === 0 ? "\n✅ 공유 DB 정상\n" : `\n❌ 실패 ${failed}건\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[turso:verify] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});

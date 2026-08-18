/**
 * 데모 ERP 스모크 — 시드·조회 가드·문서흐름 왕복을 한 번에 검증한다.
 *   npx tsx scripts/erp-smoke.ts
 *
 * 검증 항목
 *  1. 시드 생성 + 마스터/문서 건수
 *  2. 조회 게이트웨이 read-only 가드 (INSERT 거부 · CALL 화이트리스트)
 *  3. HANA 호환 계층 (SELECT TOP · TO_VARCHAR · TO_DECIMAL · DAYS_BETWEEN)
 *  4. 프로시저 재구현 CF_W5000 두 모드
 *  5. 문서흐름 왕복 — 판매오더 생성 → 부분납품 → 미결수량 검증 → 취소 가드 → 납품 취소 → 복원
 *  6. 재고·약정 정합 (OITM.OnHand = OITW 합)
 *  7. 재고 수불부(W5071) 대사 — 화면과 같은 CTE 를 게이트웨이로 실행, 기말잔고 = OITW.OnHand
 *
 * 🔴 항상 **메모리 DB** 로 돈다 — 스모크가 만드는 검증용 문서가 로컬 데모 DB(.data)를
 *    오염시키면 대시보드 '최근 트랜잭션'에 테스트 흔적이 남는다. import 전에 env 를 세팅해야
 *    하므로 아래는 정적 import 가 아니라 동적 import 다.
 */
process.env.DATABASE_PATH = ":memory:";

type HanaMod = typeof import("../src/lib/db/hana");
type SqliteMod = typeof import("../src/lib/db/sqlite");
type ErpMod = typeof import("../src/lib/sl/localErp");

let query: HanaMod["query"];
let ReadOnlyViolation: HanaMod["ReadOnlyViolation"];
let closeDb: SqliteMod["closeDb"];
let getDb: SqliteMod["getDb"];
let engineCancel: ErpMod["engineCancel"];
let engineCreate: ErpMod["engineCreate"];
let engineCreateFromBase: ErpMod["engineCreateFromBase"];
let engineUpdate: ErpMod["engineUpdate"];
let translateHanaSql: SqliteMod["translateHanaSql"];

/** env 세팅 뒤에 로드해야 메모리 DB 로 뜬다 */
async function loadModules(): Promise<void> {
  ({ query, ReadOnlyViolation } = await import("../src/lib/db/hana"));
  ({ closeDb, getDb, translateHanaSql } = await import("../src/lib/db/sqlite"));
  ({ engineCancel, engineCreate, engineCreateFromBase, engineUpdate } =
    await import("../src/lib/sl/localErp"));
}

let failed = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(
    `${ok ? "  ok " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failed++;
}
async function expectThrow(
  label: string,
  fn: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    await fn();
    check(label, false, "예외가 발생하지 않음");
  } catch (e) {
    check(label, true, e instanceof Error ? e.message.slice(0, 60) : "");
  }
}

async function main(): Promise<void> {
  await loadModules();
  console.log("\n[1] 시드 + 기본 조회");
  const items = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM "OITM"`);
  const orders = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM "ORDR"`);
  const invoices = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "OINV"`,
  );
  check("품목 마스터", items[0].n >= 20, `${items[0].n}종`);
  check("판매오더", orders[0].n >= 30, `${orders[0].n}건`);
  check("A/R송장", invoices[0].n >= 10, `${invoices[0].n}건`);

  console.log("\n[2] read-only 가드");
  await expectThrow("INSERT 거부", () =>
    query(`INSERT INTO "OITM" ("ItemCode") VALUES ('X')`),
  );
  await expectThrow("다중문 거부", () => query(`SELECT 1; SELECT 2`));
  await expectThrow("비화이트리스트 CALL 거부", () =>
    query(`CALL "XX_HACK"()`),
  );
  const roErr = await query(`SELECT 1 AS ok`)
    .then(() => null)
    .catch((e) => e);
  check("정상 SELECT 통과", roErr === null);
  check("가드 예외 타입", new ReadOnlyViolation("t") instanceof Error);

  console.log("\n[3] HANA 호환 계층");
  const top = await query<{ DocEntry: number }>(
    `SELECT TOP 3 "DocEntry" FROM "ORDR"`,
  );
  check("SELECT TOP n → LIMIT", top.length === 3, `${top.length}행`);
  const fmt = await query<{ m: string; d: string; c: string; days: number }>(
    `SELECT TO_VARCHAR("DocDate",'YYYY-MM') AS m, TO_VARCHAR("DocDate",'YYYY-MM-DD') AS d,
            TO_VARCHAR("DocDate",'YYYYMMDD') AS c,
            DAYS_BETWEEN("DocDate", "DocDueDate") AS days
       FROM "ORDR" LIMIT 1`,
  );
  check("TO_VARCHAR YYYY-MM", /^\d{4}-\d{2}$/.test(fmt[0].m), fmt[0].m);
  check("TO_VARCHAR YYYYMMDD", /^\d{8}$/.test(fmt[0].c), fmt[0].c);
  check("DAYS_BETWEEN", Number.isFinite(fmt[0].days), String(fmt[0].days));
  // 회귀: TOP 재작성이 주석·문자열 리터럴에 먹히거나 서브쿼리를 끌어올리면 안 된다
  const topWithComment = await query<{ DocEntry: number }>(
    `SELECT TOP 3 "DocEntry" FROM "ORDR" -- 최근순`,
  );
  check(
    "TOP + 라인주석 (LIMIT 이 주석에 먹히지 않음)",
    topWithComment.length === 3,
    `${topWithComment.length}행`,
  );
  const litRow = await query<{ lit: string }>(
    `SELECT 'SELECT TOP 9' AS lit FROM "OADM"`,
  );
  check(
    "문자열 리터럴 안의 TOP 보존",
    litRow[0]?.lit === "SELECT TOP 9",
    String(litRow[0]?.lit),
  );
  // 서브쿼리 안의 UNION 은 허용해야 한다 — W3100(일일현황)이 이 형태다
  const unionInSub = await query<{ n: number }>(
    `SELECT TOP 5 t."k", COUNT(*) AS n FROM (
       SELECT "DocEntry" AS "k" FROM "ORDR"
       UNION ALL
       SELECT "DocEntry" AS "k" FROM "OPOR"
     ) t GROUP BY t."k"`,
  );
  check(
    "서브쿼리 UNION + 최외곽 TOP 허용",
    unionInSub.length > 0 && unionInSub.length <= 5,
    `${unionInSub.length}행`,
  );

  for (const [label, sql] of [
    [
      "서브쿼리 TOP 거부",
      `SELECT * FROM (SELECT TOP 5 "DocEntry" FROM "ORDR") x`,
    ],
    [
      "최외곽 UNION + TOP 거부",
      `SELECT TOP 5 "DocEntry" FROM "ORDR" UNION ALL SELECT "DocEntry" FROM "OPOR"`,
    ],
  ] as const) {
    let threw = false;
    try {
      translateHanaSql(sql);
    } catch {
      threw = true;
    }
    check(label, threw);
  }

  const dec = await query<{ v: number }>(
    `SELECT TO_DECIMAL(SUM("DocTotal"),18,2) AS v FROM "OINV"`,
  );
  check("TO_DECIMAL", Number(dec[0].v) > 0, String(dec[0].v));

  console.log("\n[4] CF_W5000 재구현");
  const stock = await query<{ GAYOUNG: string }>(
    `CALL "CF_W5000"(?,?,?,?,?,?,?,?)`,
    ["W", "", "", "", "", "", "", ""],
  );
  check("Gubun='W' 창고별 재고", stock.length > 0, `${stock.length}행`);
  const ledger = await query<{ DOCENTRY: string; Cumulated: string }>(
    `CALL "CF_W5000"(?,?,?,?,?,?,?,?)`,
    ["J", "20000101", "20991231", "", "", "", "", ""],
  );
  const subtotals = ledger.filter((r) => r.DOCENTRY === "");
  check("Gubun='J' 재고전기리스트", ledger.length > 0, `${ledger.length}행`);
  check(
    "소계행 계약(DOCENTRY 빈값)",
    subtotals.length >= 2,
    `${subtotals.length}행`,
  );
  check("누계 콤마 포맷 문자열", typeof ledger[0].Cumulated === "string");

  console.log("\n[5] 문서흐름 왕복");
  const cust = (
    await query<{ CardCode: string }>(
      `SELECT "CardCode" FROM "OCRD" WHERE "CardType"='C' LIMIT 1`,
    )
  )[0];
  const item = (
    await query<{ ItemCode: string }>(`SELECT "ItemCode" FROM "OITM" LIMIT 1`)
  )[0];
  const so = engineCreate(
    "Orders",
    { CardCode: cust.CardCode, DocDueDate: "2030-12-31", BPLId: 1 },
    [
      {
        ItemCode: item.ItemCode,
        Quantity: 100,
        Price: 1000,
        VatGroup: "A8",
        WarehouseCode: "W1000",
      },
    ],
  );
  check(
    "판매오더 생성",
    so.DocEntry > 0,
    `DocEntry=${so.DocEntry} DocNum=${so.DocNum}`,
  );

  await expectThrow("미결수량 초과 이월 거부", async () =>
    engineCreateFromBase("DeliveryNotes", { CardCode: cust.CardCode }, [
      { BaseType: 17, BaseEntry: so.DocEntry, BaseLine: 0, Quantity: 150 },
    ]),
  );

  const stockBefore = (
    await query<{ q: number }>(
      `SELECT "OnHand" AS q FROM "OITW" WHERE "ItemCode"=? AND "WhsCode"='W1000'`,
      [item.ItemCode],
    )
  )[0].q;
  const dlv = engineCreateFromBase(
    "DeliveryNotes",
    { CardCode: cust.CardCode },
    [{ BaseType: 17, BaseEntry: so.DocEntry, BaseLine: 0, Quantity: 40 }],
  );
  const afterPartial = (
    await query<{ OpenQty: number; LineStatus: string }>(
      `SELECT "OpenQty","LineStatus" FROM "RDR1" WHERE "DocEntry"=? AND "LineNum"=0`,
      [so.DocEntry],
    )
  )[0];
  check(
    "부분납품 후 미결수량",
    Number(afterPartial.OpenQty) === 60,
    `OpenQty=${afterPartial.OpenQty}`,
  );
  check("부분납품 라인 열림 유지", afterPartial.LineStatus === "O");
  const stockAfter = (
    await query<{ q: number }>(
      `SELECT "OnHand" AS q FROM "OITW" WHERE "ItemCode"=? AND "WhsCode"='W1000'`,
      [item.ItemCode],
    )
  )[0].q;
  check(
    "납품 시 재고 차감",
    Number(stockBefore) - Number(stockAfter) === 40,
    `${stockBefore}→${stockAfter}`,
  );

  await expectThrow("후속문서 있는 오더 취소 거부", () =>
    engineCancel("Orders", so.DocEntry),
  );

  // ── 회귀: 이월된 라인의 정체성 변경 차단 (품목·창고를 바꾸면 후속문서 체인이 어긋난다)
  const otherItem = (
    await query<{ ItemCode: string }>(
      `SELECT "ItemCode" FROM "OITM" WHERE "ItemCode" <> ? LIMIT 1`,
      [item.ItemCode],
    )
  )[0];
  const editBase = {
    DocDueDate: "2030-12-31",
    NumAtCard: "",
    comments: "",
  };
  await expectThrow("이월 라인의 품목 변경 거부", () =>
    engineUpdate("Orders", so.DocEntry, editBase, [
      {
        ItemCode: otherItem.ItemCode,
        Quantity: 100,
        Price: 1000,
        VatGroup: "A8",
        WarehouseCode: "W1000",
        LineNum: 0,
      },
    ]),
  );
  await expectThrow("이월 라인의 창고 변경 거부", () =>
    engineUpdate("Orders", so.DocEntry, editBase, [
      {
        ItemCode: item.ItemCode,
        Quantity: 100,
        Price: 1000,
        VatGroup: "A8",
        WarehouseCode: "W2000",
        LineNum: 0,
      },
    ]),
  );
  // 회귀: 라인 추가 시 LineNum 채번이 기존 번호와 충돌하지 않는다
  engineUpdate("Orders", so.DocEntry, editBase, [
    {
      ItemCode: item.ItemCode,
      Quantity: 100,
      Price: 1000,
      VatGroup: "A8",
      WarehouseCode: "W1000",
      LineNum: 0,
    },
    {
      ItemCode: otherItem.ItemCode,
      Quantity: 7,
      Price: 500,
      VatGroup: "A8",
      WarehouseCode: "W1000",
    },
  ]);
  const afterAdd = await query<{ LineNum: number }>(
    `SELECT "LineNum" FROM "RDR1" WHERE "DocEntry"=? ORDER BY "LineNum"`,
    [so.DocEntry],
  );
  check(
    "라인 추가 시 LineNum 충돌 없음",
    afterAdd.length === 2 && afterAdd[0].LineNum !== afterAdd[1].LineNum,
    afterAdd.map((r) => r.LineNum).join(","),
  );

  engineCancel("DeliveryNotes", dlv.DocEntry);
  const restored = (
    await query<{ OpenQty: number }>(
      `SELECT "OpenQty" FROM "RDR1" WHERE "DocEntry"=? AND "LineNum"=0`,
      [so.DocEntry],
    )
  )[0];
  const stockRestored = (
    await query<{ q: number }>(
      `SELECT "OnHand" AS q FROM "OITW" WHERE "ItemCode"=? AND "WhsCode"='W1000'`,
      [item.ItemCode],
    )
  )[0];
  check(
    "납품 취소 → 미결수량 복원",
    Number(restored.OpenQty) === 100,
    `OpenQty=${restored.OpenQty}`,
  );
  check(
    "납품 취소 → 재고 복원",
    Number(stockRestored.q) === Number(stockBefore),
  );
  engineCancel("Orders", so.DocEntry);
  const canceled = (
    await query<{ CANCELED: string }>(
      `SELECT "CANCELED" FROM "ORDR" WHERE "DocEntry"=?`,
      [so.DocEntry],
    )
  )[0];
  check("오더 취소 마킹", canceled.CANCELED === "Y");

  console.log("\n[6] 재고 정합");
  const mismatch = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "OITM" i
      WHERE ABS(i."OnHand" - COALESCE((SELECT SUM(w."OnHand") FROM "OITW" w WHERE w."ItemCode"=i."ItemCode"),0)) > 0.001`,
  );
  check(
    "OITM.OnHand = OITW 합",
    mismatch[0].n === 0,
    `불일치 ${mismatch[0].n}종`,
  );

  const dangling = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "DLN1" l
      WHERE l."BaseType"=17 AND NOT EXISTS (SELECT 1 FROM "RDR1" b WHERE b."DocEntry"=l."BaseEntry" AND b."LineNum"=l."BaseLine")`,
  );
  check(
    "Base 체인 무결성",
    dangling[0].n === 0,
    `끊긴 링크 ${dangling[0].n}건`,
  );

  console.log("\n[7] 재고 수불부(W5071) 대사");
  // 화면(W5071)과 동일한 CTE 를 read-only 게이트웨이로 실행한다.
  //  - CTE·CASE 집계가 게이트웨이 가드와 SQLite 어댑터를 통과하는지 (회귀 방지)
  //  - 위 [5] 에서 납품·오더를 취소했으므로 원장엔 역분개 행이 섞여 있다 → 그 상태에서도
  //    OINM 을 필터 없이 전부 합산한 기말잔고가 OITW.OnHand 와 일치해야 한다.
  const sbSpan = await query<{ MaxD: string | null }>(
    `SELECT MAX("DocDate") AS "MaxD" FROM "OINM"`,
  );
  const sbMax = String(sbSpan[0]?.MaxD ?? "");
  const sbY = Number(sbMax.slice(0, 4));
  const sbEndM = Number(sbMax.slice(5, 7));
  const sbPad = (n: number) => String(n).padStart(2, "0");
  const sbLastDay = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const sbAgg: string[] = [
    `SUM(CASE WHEN m."DocDate" < ? THEN m."InQty" - m."OutQty" ELSE 0 END) AS "Opening"`,
  ];
  const sbParams: (string | number)[] = [`${sbY}-01-01`];
  const sbKeys: string[] = [];
  for (let m = 1; m <= sbEndM; m += 1) {
    const k = `m${m}`;
    sbKeys.push(k);
    const from = `${sbY}-${sbPad(m)}-01`;
    const to = `${sbY}-${sbPad(m)}-${sbPad(sbLastDay(sbY, m))}`;
    sbAgg.push(`SUM(CASE WHEN m."DocDate" BETWEEN ? AND ? THEN m."InQty" ELSE 0 END) AS "in_${k}"`);
    sbParams.push(from, to);
    sbAgg.push(`SUM(CASE WHEN m."DocDate" BETWEEN ? AND ? THEN m."OutQty" ELSE 0 END) AS "out_${k}"`);
    sbParams.push(from, to);
  }
  sbParams.push(`${sbY}-${sbPad(sbEndM)}-${sbPad(sbLastDay(sbY, sbEndM))}`);
  const sbOuter = [`mv."Opening"`].concat(
    sbKeys.flatMap((k) => [`mv."in_${k}"`, `mv."out_${k}"`]),
  );
  const sbSql = `WITH mv AS (
  SELECT m."ItemCode", ${sbAgg.join(", ")}
  FROM "OINM" m
  WHERE m."DocDate" <= ?
  GROUP BY m."ItemCode"
)
SELECT i."ItemCode", ${sbOuter.join(", ")}
FROM mv
JOIN "OITM" i ON i."ItemCode" = mv."ItemCode"
ORDER BY i."ItemCode"`;
  const sbRows = await query<Record<string, string | number | null>>(sbSql, sbParams);
  check("게이트웨이 CTE 집계 통과", sbRows.length > 0, `${sbRows.length}개 품목`);

  const sbOnHand = await query<{ ItemCode: string; S: number }>(
    `SELECT "ItemCode", SUM("OnHand") AS "S" FROM "OITW" GROUP BY "ItemCode"`,
  );
  const sbOnHandMap = new Map(sbOnHand.map((r) => [r.ItemCode, Number(r.S)]));
  let sbBad = 0;
  for (const r of sbRows) {
    let running = Number(r.Opening ?? 0);
    for (const k of sbKeys) running += Number(r[`in_${k}`] ?? 0) - Number(r[`out_${k}`] ?? 0);
    if (Math.abs(running - (sbOnHandMap.get(String(r.ItemCode)) ?? 0)) > 0.001) sbBad += 1;
  }
  check("기말잔고 = OITW.OnHand (취소 역분개 포함)", sbBad === 0, `불일치 ${sbBad}종`);

  getDb();
  closeDb();
  console.log(failed === 0 ? "\n✅ 전체 통과\n" : `\n❌ 실패 ${failed}건\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("스모크 실행 오류:", e);
  process.exit(1);
});

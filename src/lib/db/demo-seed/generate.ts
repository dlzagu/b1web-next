/**
 * 결정적(deterministic) 시드 생성기 — 전부 가상 데이터.
 *
 * 핵심 설계: 문서는 SQL 로 직접 꽂지 않고 **로컬 ERP 엔진을 통해 생성**한다
 * (구매오더→입고→A/P송장, 판매오더→납품→A/R송장 draw, 일부 취소까지 실제 엔진 호출).
 * 그래서 OpenQty·LineStatus·DocStatus·Base 체인·재고원장(OINM)·분개(OJDT)의
 * 불변식이 계산이 아니라 **구성으로** 보장된다 — 시드가 곧 엔진 통합 테스트다.
 */
import type { DemoDb } from "../sqlite";
import { SCHEMA_SQL } from "./schema";
import {
  engineCancel,
  engineCreate,
  engineCreateFromBase,
  type EngineCreated,
} from "@/lib/sl/localErp";
import {
  BP_GROUPS,
  BRANCHES,
  COMPANY_NAME,
  COST_CENTERS,
  CURRENCIES,
  CUSTOMERS,
  EMPLOYEES,
  ITEM_GROUPS,
  ITEMS,
  ORDER_COMMENTS,
  PAYMENT_TERMS,
  PROJECT_NAMES,
  SALES_EMPLOYEES,
  UDF_DEFS,
  VAT_GROUPS,
  VENDORS,
  WAREHOUSES,
} from "./corpus";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 시드 완료 마커 — '테이블 존재'가 아니라 '끝까지 완료'를 판정 기준으로 삼는다 */
const SEED_DONE_TABLE = "DEMO_SEED_DONE";

export function ensureSeed(db: DemoDb): void {
  const done = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?`,
    )
    .get(SEED_DONE_TABLE) as { n: number };
  if (done.n > 0) return;

  const t0 = Date.now();
  // 🔴 전체를 한 트랜잭션으로 — 중간에 실패하면 통째로 롤백되어야 한다.
  //    (완료 마커까지 같은 트랜잭션에 넣어야 '반쪽 DB 가 완료로 보이는' 상태가 안 생긴다)
  db.transaction(() => {
    db.exec(SCHEMA_SQL);
    seedMasters(db);
    seedDocuments(db);
    finalizeBalances(db);
    db.exec(`CREATE TABLE "${SEED_DONE_TABLE}" ("seededAt" TEXT)`);
    db.prepare(`INSERT INTO "${SEED_DONE_TABLE}" ("seededAt") VALUES (?)`).run(
      new Date().toISOString(),
    );
  }).immediate();

  const docs = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM "ORDR") + (SELECT COUNT(*) FROM "OPOR") AS n`,
    )
    .get() as {
    n: number;
  };
  console.info(
    `[demo-seed] 가상 ERP 데이터 생성 완료 — 오더 ${docs.n}건 외, ${Date.now() - t0}ms`,
  );
}

// ── 마스터 ──────────────────────────────────────────────────
function seedMasters(db: DemoDb): void {
  const run = (sql: string, rows: (string | number | null)[][]) => {
    const stmt = db.prepare(sql);
    for (const r of rows) stmt.run(...r);
  };

  db.prepare(`INSERT INTO "OADM" ("CompnyName") VALUES (?)`).run(COMPANY_NAME);

  run(
    `INSERT INTO "OBPL" ("BPLId","BPLName","Disabled") VALUES (?,?,'N')`,
    BRANCHES.map((b) => [b.id, b.name]),
  );
  run(
    `INSERT INTO "OWHS" ("WhsCode","WhsName") VALUES (?,?)`,
    WAREHOUSES.map((w) => [w.code, w.name]),
  );
  run(
    `INSERT INTO "OPRC" ("PrcCode","PrcName","Active","DimCode","U_DIRECTYN") VALUES (?,?,'Y',1,?)`,
    COST_CENTERS.map((c) => [c.code, c.name, c.direct]),
  );
  run(
    `INSERT INTO "OOCR" ("OcrCode","OcrName","DimCode") VALUES (?,?,1)`,
    COST_CENTERS.map((c) => [c.code, c.name]),
  );
  run(
    `INSERT INTO "OCRN" ("CurrCode","CurrName") VALUES (?,?)`,
    CURRENCIES.map((c) => [c.code, c.name]),
  );
  run(
    `INSERT INTO "OVTG" ("Code","Name","Rate","Category","Inactive") VALUES (?,?,?,?,'N')`,
    VAT_GROUPS.map((v) => [v.code, v.name, v.rate, v.category]),
  );
  run(
    `INSERT INTO "OCTG" ("GroupNum","PymntGroup") VALUES (?,?)`,
    PAYMENT_TERMS.map((p) => [p.num, p.name]),
  );
  run(
    `INSERT INTO "OSLP" ("SlpCode","SlpName") VALUES (?,?)`,
    SALES_EMPLOYEES.map((s) => [s.code, s.name]),
  );
  run(
    `INSERT INTO "OHEM" ("empID","firstName","lastName","Active") VALUES (?,?,?,'Y')`,
    EMPLOYEES.map((e) => [e.id, e.first, e.last]),
  );
  run(
    `INSERT INTO "OCRG" ("GroupCode","GroupName") VALUES (?,?)`,
    BP_GROUPS.map((g) => [g.code, g.name]),
  );
  run(
    `INSERT INTO "OITB" ("ItmsGrpCod","ItmsGrpNam") VALUES (?,?)`,
    ITEM_GROUPS.map((g) => [g.code, g.name]),
  );
  run(
    `INSERT INTO "CUFD" ("TableID","AliasID","Descr","TypeID") VALUES (?,?,?,?)`,
    UDF_DEFS.map((u) => [u.table, u.alias, u.label, u.type]),
  );

  run(
    `INSERT INTO "OITM"
       ("ItemCode","ItemName","ItmsGrpCod","PrchseItem","SellItem","InvntItem","OnHand","IsCommited","OnOrder","AvgPrice","CardCode","validFor","FirmName","U_ItemGR1")
     VALUES (?,?,?,'Y','Y','Y',0,0,0,?,?, 'Y',?,?)`,
    ITEMS.map((i) => [
      i.code,
      i.name,
      i.group,
      i.price,
      i.vendor,
      i.firm,
      i.gr1,
    ]),
  );

  const bps = [...CUSTOMERS, ...VENDORS];
  run(
    `INSERT INTO "OCRD"
       ("CardCode","CardName","CardType","GroupCode","Currency","Phone1","E_Mail","CntctPrsn","Address","SlpCode","Balance","validFor")
     VALUES (?,?,?,?,'KRW',?,?,?,?,?,0,'Y')`,
    bps.map((b, i) => [
      b.code,
      b.name,
      b.type,
      b.group,
      `02-5${pad2(i)}0-${1000 + i * 7}`,
      `contact@${b.code.toLowerCase()}.example`,
      b.contact,
      `${b.city}시 데모로 ${10 + i}`,
      b.slp,
    ]),
  );
  run(
    `INSERT INTO "CRD1" ("CardCode","AdresType","Address","Street","City","ZipCode","Country") VALUES (?, 'B', '기본', ?, ?, ?, 'KR')`,
    bps.map((b, i) => [
      b.code,
      `데모로 ${10 + i}`,
      b.city,
      String(10000 + i * 111),
    ]),
  );
}

// ── 문서 (엔진 경유) ─────────────────────────────────────────
function seedDocuments(db: DemoDb): void {
  const rnd = mulberry32(0x0c4b1220);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const int = (min: number, max: number) =>
    min + Math.floor(rnd() * (max - min + 1));
  const chance = (p: number) => rnd() < p;
  const now = new Date();

  /** monthsBack 개월 전의 임의 영업일. 당월이면 오늘-3일 이전으로 캡 */
  const dayIn = (monthsBack: number): Date => {
    const maxDay = monthsBack === 0 ? Math.max(1, now.getDate() - 3) : 25;
    return new Date(
      now.getFullYear(),
      now.getMonth() - monthsBack,
      int(1, Math.max(1, maxDay)),
    );
  };
  const addDays = (d: Date, n: number): Date => {
    const r = new Date(d.getTime() + n * 86_400_000);
    return r.getTime() > now.getTime() ? now : r;
  };

  // 1) 기초 재고 (opening balance) — OITW 직접 + OINM 기초행
  //    ⚠️ 문서는 now 기준 8개월 소급 생성되므로 기초일은 **그보다 앞**이어야 원장 등식이 성립한다
  //    (당해 1/1 로 고정하면 상반기에 시드할 때 문서가 기초보다 앞서 음수 재고가 나온다)
  const openingDate = ymd(new Date(now.getFullYear(), now.getMonth() - 9, 1));
  /** 문서번호 없는 이동(기초·실사·기타)의 의사 DocEntry — 0 은 화면이 소계행으로 오인한다 */
  let miscDocEntry = 90000;
  const insItw = db.prepare(
    `INSERT INTO "OITW" ("ItemCode","WhsCode","OnHand","MinStock","MaxStock") VALUES (?,?,?,?,?)`,
  );
  const insInm = db.prepare(
    `INSERT INTO "OINM" ("ItemCode","DocDate","DocTime","TransType","InQty","OutQty","Warehouse","CreatedBy","DocLineNum","Comments")
     VALUES (?,?,900,310000001,?,0,?,?,0,'재고 기초잔액')`,
  );
  for (const item of ITEMS) {
    const w1 = int(150, 600);
    const w2 = int(50, 250);
    insItw.run(item.code, "W1000", w1, 50, 2000);
    insItw.run(item.code, "W2000", w2, 20, 1000);
    insItw.run(item.code, "W3000", 0, 0, 0);
    insInm.run(item.code, openingDate, w1, "W1000", ++miscDocEntry);
    insInm.run(item.code, openingDate, w2, "W2000", ++miscDocEntry);
    db.prepare(`UPDATE "OITM" SET "OnHand" = ? WHERE "ItemCode" = ?`).run(
      w1 + w2,
      item.code,
    );
  }

  const cancelableSales: number[] = [];
  const cancelablePurchase: number[] = [];

  // 2) 구매 체인: 구매오더 → (75%) 입고 draw → (70%) A/P송장 draw
  for (let m = 7; m >= 0; m--) {
    const count = int(4, 6);
    for (let i = 0; i < count; i++) {
      const vendor = pick(VENDORS);
      const vendorItems = ITEMS.filter((it) => it.vendor === vendor.code);
      if (!vendorItems.length) continue;
      const lineItems = [
        ...new Set(Array.from({ length: int(1, 3) }, () => pick(vendorItems))),
      ];
      const poDate = dayIn(m);
      const po: EngineCreated = engineCreate(
        "PurchaseOrders",
        {
          CardCode: vendor.code,
          DocDate: ymd(poDate),
          DocDueDate: ymd(addDays(poDate, int(7, 21))),
          BPLId: 1,
          PaymentGroupCode: pick(PAYMENT_TERMS).num,
          comments: pick(ORDER_COMMENTS) || undefined,
          udf: { U_PJT: pick(PROJECT_NAMES) || null },
        },
        lineItems.map((it) => ({
          ItemCode: it.code,
          Quantity: int(4, 20) * 10,
          Price: Math.round(it.price * 0.6),
          VatGroup: "V2",
          WarehouseCode: chance(0.7) ? "W1000" : "W2000",
          // 구매 라인에도 코스트센터를 채운다 — 비우면 구매 3화면의 코스트센터 검색이 늘 0건
          CostingCode: chance(0.5) ? "210001" : "220001",
        })),
      );

      // 당월도 절반은 입고까지 진행 (나머지는 미결로 남아 입고 draw 데모가 된다)
      if (chance(m === 0 ? 0.5 : 0.75)) {
        // 입고 — 일부는 부분 입고
        const poLines = db
          .prepare(
            `SELECT "LineNum","Quantity" FROM "POR1" WHERE "DocEntry" = ?`,
          )
          .all(po.DocEntry) as { LineNum: number; Quantity: number }[];
        const grDate = ymd(addDays(poDate, int(3, 10)));
        const gr = engineCreateFromBase(
          "PurchaseDeliveryNotes",
          { CardCode: vendor.code, DocDate: grDate, DocDueDate: grDate },
          poLines.map((l) => ({
            BaseType: 22,
            BaseEntry: po.DocEntry,
            BaseLine: l.LineNum,
            Quantity: chance(0.85)
              ? l.Quantity
              : Math.max(10, Math.round(l.Quantity * 0.6)),
          })),
        );
        if (chance(0.7)) {
          const grLines = db
            .prepare(
              `SELECT "LineNum","Quantity" FROM "PDN1" WHERE "DocEntry" = ?`,
            )
            .all(gr.DocEntry) as { LineNum: number; Quantity: number }[];
          const apDate = ymd(addDays(poDate, int(11, 20)));
          engineCreateFromBase(
            "PurchaseInvoices",
            { CardCode: vendor.code, DocDate: apDate, DocDueDate: apDate },
            grLines.map((l) => ({
              BaseType: 20,
              BaseEntry: gr.DocEntry,
              BaseLine: l.LineNum,
              Quantity: l.Quantity,
            })),
          );
        }
      } else if (m <= 1 && chance(0.4)) {
        cancelablePurchase.push(po.DocEntry);
      }
    }
  }

  // 3) 판매 체인: 판매오더 → (70%) 납품 draw(부분 포함) → (80%) A/R송장 draw
  for (let m = 7; m >= 0; m--) {
    // 당월은 대시보드 첫 화면이라 표본이 얇으면 증감률이 왜곡된다 → 물량을 늘린다
    const count = m === 0 ? int(12, 16) : int(6, 9);
    for (let i = 0; i < count; i++) {
      const cust = pick(CUSTOMERS);
      const lineItems = [
        ...new Set(Array.from({ length: int(1, 4) }, () => pick(ITEMS))),
      ];
      const soDate = dayIn(m);
      const so = engineCreate(
        "Orders",
        {
          CardCode: cust.code,
          DocDate: ymd(soDate),
          DocDueDate: ymd(addDays(soDate, int(5, 14))),
          BPLId: chance(0.8) ? 1 : 2,
          SalesPersonCode: cust.slp,
          PaymentGroupCode: pick(PAYMENT_TERMS).num,
          NumAtCard: chance(0.4)
            ? `PO-${now.getFullYear()}${pad2(int(1, 12))}-${int(100, 999)}`
            : undefined,
          comments: pick(ORDER_COMMENTS) || undefined,
          udf: { U_PJT: pick(PROJECT_NAMES) || null },
        },
        lineItems.map((it) => ({
          ItemCode: it.code,
          Quantity: int(1, 8) * 5,
          Price: it.price,
          VatGroup: "A8",
          WarehouseCode: chance(0.75) ? "W1000" : "W2000",
          CostingCode: chance(0.6) ? "210001" : "210002",
          ShipDate: ymd(addDays(soDate, int(5, 14))),
          udf: chance(0.2) ? { U_Memo: "지정 택배 요청" } : undefined,
        })),
      );

      // 당월도 상당수는 납품·송장까지 진행시킨다 (나머지는 미결로 남아 draw 데모가 된다)
      const deliver = m === 0 ? chance(0.6) : chance(0.75);
      if (deliver) {
        const soLines = db
          .prepare(
            `SELECT "LineNum","Quantity" FROM "RDR1" WHERE "DocEntry" = ?`,
          )
          .all(so.DocEntry) as { LineNum: number; Quantity: number }[];
        const partial = chance(0.25);
        const dlvDate = ymd(addDays(soDate, int(2, 7)));
        const dlv = engineCreateFromBase(
          "DeliveryNotes",
          { CardCode: cust.code, DocDate: dlvDate, DocDueDate: dlvDate },
          soLines.map((l, idx) => ({
            BaseType: 17,
            BaseEntry: so.DocEntry,
            BaseLine: l.LineNum,
            // 부분납품 시나리오 — 마지막 라인만 60% 이월해 미결(OpenQty>0)을 남긴다
            Quantity:
              partial && idx === soLines.length - 1
                ? Math.max(5, Math.round(l.Quantity * 0.6))
                : l.Quantity,
          })),
        );
        if (chance(0.8)) {
          const dlvLines = db
            .prepare(
              `SELECT "LineNum","Quantity" FROM "DLN1" WHERE "DocEntry" = ?`,
            )
            .all(dlv.DocEntry) as { LineNum: number; Quantity: number }[];
          const invDate = ymd(addDays(soDate, int(8, 16)));
          engineCreateFromBase(
            "Invoices",
            {
              CardCode: cust.code,
              DocDate: invDate,
              DocDueDate: ymd(addDays(soDate, int(30, 60))),
            },
            dlvLines.map((l) => ({
              BaseType: 15,
              BaseEntry: dlv.DocEntry,
              BaseLine: l.LineNum,
              Quantity: l.Quantity,
            })),
          );
        }
      } else if (chance(0.25)) {
        cancelableSales.push(so.DocEntry);
      }
    }
  }

  // 4) 취소 시나리오 — 미이월 오더만 엔진 취소 (취소 문서 데모 + 목록 '취소포함' 필터)
  for (const e of cancelableSales.slice(0, 3)) engineCancel("Orders", e);
  for (const e of cancelablePurchase.slice(0, 2))
    engineCancel("PurchaseOrders", e);

  // 5) 송장 수금/지급 — 65% 완납(마감), 15% 부분수금
  for (const table of ["OINV", "OPCH"] as const) {
    const rows = db
      .prepare(
        `SELECT "DocEntry","DocTotal" FROM "${table}" WHERE "CANCELED"='N'`,
      )
      .all() as {
      DocEntry: number;
      DocTotal: number;
    }[];
    for (const r of rows) {
      const roll = rnd();
      if (roll < 0.65) {
        db.prepare(
          `UPDATE "${table}" SET "PaidToDate" = "DocTotal", "DocStatus" = 'C' WHERE "DocEntry" = ?`,
        ).run(r.DocEntry);
      } else if (roll < 0.8) {
        db.prepare(
          `UPDATE "${table}" SET "PaidToDate" = ? WHERE "DocEntry" = ?`,
        ).run(Math.round(r.DocTotal * (0.3 + rnd() * 0.4)), r.DocEntry);
      }
    }
  }

  // 6) 재고이전요청 (OWTQ/WTQ1 — W5030, 표준 매핑: 출고창고=Filler)
  for (let i = 0; i < 6; i++) {
    const docEntry = i + 1;
    const d = dayIn(int(0, 3));
    const status = i < 4 ? "O" : "C";
    // 거래처를 비우면 W5030 의 거래처 검색조건이 늘 0건이 된다
    const cust = pick(CUSTOMERS);
    let wtqTotal = 0;
    db.prepare(
      `INSERT INTO "OWTQ" ("DocEntry","DocNum","DocDate","DocDueDate","CardCode","CardName","SlpCode","Comments","Filler","ToWhsCode","Address","DocTotal","DocStatus","CANCELED","CreateDate")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    ).run(
      docEntry,
      70001 + i,
      ymd(d),
      ymd(addDays(d, 3)),
      cust.code,
      cust.name,
      pick(SALES_EMPLOYEES).code,
      i === 0 ? "물류센터 재고 보충" : null,
      "W1000",
      "W2000",
      "물류센터 (경기)",
      status,
      i === 5 ? "Y" : "N",
      ymd(d),
    );
    const items = [
      ...new Set(Array.from({ length: int(1, 3) }, () => pick(ITEMS))),
    ];
    items.forEach((it, li) => {
      const qty = int(2, 10) * 5;
      const lineTotal = qty * it.price;
      wtqTotal += lineTotal;
      db.prepare(
        `INSERT INTO "WTQ1" ("DocEntry","LineNum","ItemCode","Dscription","Quantity","OpenQty","unitMsr","Price","LineTotal","WhsCode","LineStatus")
         VALUES (?,?,?,?,?,?, 'EA', ?, ?, 'W1000', ?)`,
      ).run(
        docEntry,
        li,
        it.code,
        it.name,
        qty,
        status === "O" ? qty : 0,
        it.price,
        lineTotal,
        status,
      );
    });
    db.prepare(`UPDATE "OWTQ" SET "DocTotal" = ? WHERE "DocEntry" = ?`).run(
      wtqTotal,
      docEntry,
    );
  }

  // 7) 기타 재고이동(실사·기타입출고·이전) — W5060 문서유형 다양화. OITW/OITM 도 함께 보정
  const misc: [number, string, number, number, string][] = [
    [58, "정기 재고실사 조정", 12, 0, "W1000"],
    [59, "판촉 샘플 입고", 30, 0, "W2000"],
    [60, "파손 폐기 출고", 0, 8, "W1000"],
    [67, "창고간 이전", 0, 20, "W1000"],
    [67, "창고간 이전", 20, 0, "W2000"],
  ];
  misc.forEach(([tt, memo, inQty, outQty, whs], i) => {
    const item = ITEMS[(i * 5) % ITEMS.length];
    const d = ymd(dayIn(int(0, 1)));
    db.prepare(
      `INSERT INTO "OINM" ("ItemCode","DocDate","DocTime","TransType","InQty","OutQty","Warehouse","CreatedBy","DocLineNum","Comments","OcrCode")
       VALUES (?,?,1100,?,?,?,?,?,0,?,'210001')`,
    ).run(item.code, d, tt, inQty, outQty, whs, ++miscDocEntry, memo);
    const delta = inQty - outQty;
    db.prepare(
      `UPDATE "OITW" SET "OnHand" = "OnHand" + ? WHERE "ItemCode" = ? AND "WhsCode" = ?`,
    ).run(delta, item.code, whs);
    db.prepare(
      `UPDATE "OITM" SET "OnHand" = "OnHand" + ? WHERE "ItemCode" = ?`,
    ).run(delta, item.code);
  });
}

// ── 마무리: 거래처 잔액 = 미결 송장 잔액 합 (대시보드 채권/채무와 정합) ──
function finalizeBalances(db: DemoDb): void {
  db.exec(`
    UPDATE "OCRD" SET "Balance" = COALESCE((
      SELECT SUM("DocTotal" - "PaidToDate") FROM "OINV"
       WHERE "OINV"."CardCode" = "OCRD"."CardCode" AND "DocStatus"='O' AND "CANCELED"='N'
    ), 0) WHERE "CardType" = 'C';
    UPDATE "OCRD" SET "Balance" = -COALESCE((
      SELECT SUM("DocTotal" - "PaidToDate") FROM "OPCH"
       WHERE "OPCH"."CardCode" = "OCRD"."CardCode" AND "DocStatus"='O' AND "CANCELED"='N'
    ), 0) WHERE "CardType" = 'S';
  `);
}

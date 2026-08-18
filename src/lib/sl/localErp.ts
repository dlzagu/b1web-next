/**
 * 로컬 ERP 엔진 — Service Layer 의 문서 생성/수정/취소/문서연결(draw) 의미론을
 * 데모 SQLite 위에 재현한다 (포트폴리오 전환: 실서버 SL 대체).
 *
 * 재현하는 SL 업무규칙:
 * - 문서연결: BaseType/BaseEntry/BaseLine 참조 → 품목·단가·창고·세금그룹을 base 에서 복사,
 *   base 라인 OpenQty 차감, 전량 이월 시 LineStatus='C', 전 라인 마감 시 헤더 DocStatus='C'
 * - 이월 수량 > 미결 수량 → 거부 (SL 업무규칙 에러와 동일하게 throw)
 * - 취소: 후속 문서가 있으면 거부. 취소 시 base 라인 미결수량 복원 + 재고 역분개
 * - 재고: 납품(-)/입고(+) 시 OINM 원장 기록 + OITW/OITM 재고 갱신, 약정(IsCommited)·
 *   발주잔량(OnOrder)은 열린 오더 라인에서 재계산
 * - 분개: 납품/송장/입고 전기 시 OJDT 생성 + 헤더 TransId 연결 (대시보드 최근 트랜잭션)
 *
 * ⚠️ 이 모듈만 데모 DB 에 쓴다. 화면 조회는 read-only 게이트웨이(@/lib/db/hana) 경유.
 *    ("server-only" 미사용 — 시드 생성기·스모크 스크립트가 Next 밖(tsx)에서도 import 한다.
 *     클라이언트 유출 방지는 소비층 documents.ts 의 server-only 가 담당)
 */
import { getDb, tableColumns, type DemoDb } from "@/lib/db/sqlite";

// ── 엔티티 좌표 ──────────────────────────────────────────────
interface EntityDef {
  header: string;
  line: string;
  objType: number;
  /** 재고 방향: -1 출고(납품) / +1 입고 / 0 없음 */
  stock: -1 | 0 | 1;
  /** OJDT TransType (분개 없는 오더류는 null) */
  jdtType: number | null;
  label: string;
}

const ENTITIES: Record<string, EntityDef> = {
  Orders: {
    header: "ORDR",
    line: "RDR1",
    objType: 17,
    stock: 0,
    jdtType: null,
    label: "판매오더",
  },
  DeliveryNotes: {
    header: "ODLN",
    line: "DLN1",
    objType: 15,
    stock: -1,
    jdtType: 15,
    label: "납품",
  },
  Invoices: {
    header: "OINV",
    line: "INV1",
    objType: 13,
    stock: 0,
    jdtType: 13,
    label: "A/R송장",
  },
  PurchaseOrders: {
    header: "OPOR",
    line: "POR1",
    objType: 22,
    stock: 0,
    jdtType: null,
    label: "구매오더",
  },
  PurchaseDeliveryNotes: {
    header: "OPDN",
    line: "PDN1",
    objType: 20,
    stock: 1,
    jdtType: 20,
    label: "입고",
  },
  PurchaseInvoices: {
    header: "OPCH",
    line: "PCH1",
    objType: 18,
    stock: 0,
    jdtType: 18,
    label: "A/P송장",
  },
};

const byObjType = (t: number): EntityDef => {
  const def = Object.values(ENTITIES).find((e) => e.objType === t);
  if (!def) throw new Error(`지원하지 않는 BaseType 입니다: ${t}`);
  return def;
};

function entityDef(name: string): EntityDef {
  const def = ENTITIES[name];
  if (!def) throw new Error(`지원하지 않는 SL 엔티티입니다: ${name}`);
  return def;
}

// 후속 문서 검사 대상: objType → 그 문서를 base 로 참조할 수 있는 라인 테이블
const CHILD_LINES: Record<number, string[]> = {
  17: ["DLN1", "INV1"],
  15: ["INV1"],
  22: ["PDN1", "PCH1"],
  20: ["PCH1"],
  13: [],
  18: [],
};

// ── 공통 헬퍼 ────────────────────────────────────────────────
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * 전기 시각(HHMM). 업무시간 밖(자정~09시)에 시드하면 같은 날 기초행(0900)보다 앞서 정렬돼
 * 원장 누계가 뒤집히므로 업무시간대로 클램프한다.
 */
const nowTime = (): number => {
  const d = new Date();
  const h = Math.min(18, Math.max(9, d.getHours()));
  return h * 100 + d.getMinutes();
};

function vatRate(db: DemoDb, code: string | null | undefined): number {
  if (!code) return 0;
  const row = db
    .prepare(`SELECT "Rate" FROM "OVTG" WHERE "Code" = ?`)
    .get(code) as { Rate: number } | undefined;
  return row ? Number(row.Rate) : 0;
}

function nextIds(
  db: DemoDb,
  header: string,
): { docEntry: number; docNum: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX("DocEntry"),0) AS e, COALESCE(MAX("DocNum"),0) AS n FROM "${header}"`,
    )
    .get() as { e: number; n: number };
  return {
    docEntry: row.e + 1,
    docNum: row.n === 0 ? row.e + 10001 : row.n + 1,
  };
}

function nextTransId(db: DemoDb): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX("TransId"),0) AS t FROM "OJDT"`)
    .get() as { t: number };
  return row.t + 1;
}

/** UDF 맵에서 해당 테이블에 실재하는 U_* 컬럼만 남긴다 (폼은 CUFD 정의만 보내므로 통상 전부 통과) */
function pickUdf(
  db: DemoDb,
  table: string,
  udf: Record<string, string | number | null> | undefined,
) {
  if (!udf) return {};
  const cols = tableColumns(db, table);
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(udf)) {
    if (k.startsWith("U_") && cols.has(k)) out[k] = v;
  }
  return out;
}

function insertRow(
  db: DemoDb,
  table: string,
  row: Record<string, unknown>,
): void {
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  ).run(...keys.map((k) => row[k] as string | number | null));
}

/** 품목 약정/발주잔량 재계산 — 열린 판매오더/구매오더의 미결수량 합 (품목·창고 단위) */
function recomputeCommitments(db: DemoDb, itemCodes: Iterable<string>): void {
  const items = [...new Set(itemCodes)];
  const openSales = db.prepare(
    `SELECT COALESCE(SUM(l."OpenQty"),0) AS q FROM "RDR1" l
      JOIN "ORDR" o ON o."DocEntry" = l."DocEntry"
     WHERE l."ItemCode" = ? AND l."LineStatus"='O' AND o."DocStatus"='O' AND o."CANCELED"='N'`,
  );
  const openSalesWhs = db.prepare(
    `SELECT COALESCE(SUM(l."OpenQty"),0) AS q FROM "RDR1" l
      JOIN "ORDR" o ON o."DocEntry" = l."DocEntry"
     WHERE l."ItemCode" = ? AND l."WhsCode" = ? AND l."LineStatus"='O' AND o."DocStatus"='O' AND o."CANCELED"='N'`,
  );
  const openPurch = db.prepare(
    `SELECT COALESCE(SUM(l."OpenQty"),0) AS q FROM "POR1" l
      JOIN "OPOR" o ON o."DocEntry" = l."DocEntry"
     WHERE l."ItemCode" = ? AND l."LineStatus"='O' AND o."DocStatus"='O' AND o."CANCELED"='N'`,
  );
  const openPurchWhs = db.prepare(
    `SELECT COALESCE(SUM(l."OpenQty"),0) AS q FROM "POR1" l
      JOIN "OPOR" o ON o."DocEntry" = l."DocEntry"
     WHERE l."ItemCode" = ? AND l."WhsCode" = ? AND l."LineStatus"='O' AND o."DocStatus"='O' AND o."CANCELED"='N'`,
  );
  const whsRows = db.prepare(
    `SELECT "WhsCode" FROM "OITW" WHERE "ItemCode" = ?`,
  );
  const updItm = db.prepare(
    `UPDATE "OITM" SET "IsCommited" = ?, "OnOrder" = ? WHERE "ItemCode" = ?`,
  );
  const updItw = db.prepare(
    `UPDATE "OITW" SET "IsCommited" = ?, "OnOrder" = ? WHERE "ItemCode" = ? AND "WhsCode" = ?`,
  );
  for (const item of items) {
    updItm.run(
      (openSales.get(item) as { q: number }).q,
      (openPurch.get(item) as { q: number }).q,
      item,
    );
    for (const w of whsRows.all(item) as { WhsCode: string }[]) {
      updItw.run(
        (openSalesWhs.get(item, w.WhsCode) as { q: number }).q,
        (openPurchWhs.get(item, w.WhsCode) as { q: number }).q,
        item,
        w.WhsCode,
      );
    }
  }
}

/** 재고 이동 반영 — OINM 원장 + OITW/OITM OnHand (창고 행이 없으면 생성) */
function postStock(
  db: DemoDb,
  p: {
    itemCode: string;
    whsCode: string | null;
    qty: number;
    direction: -1 | 1;
    transType: number;
    docEntry: number;
    lineNum: number;
    docDate: string;
    cardCode: string | null;
    cardName: string | null;
    comments?: string | null;
    ocrCode?: string | null;
  },
): void {
  const whs = p.whsCode ?? "W1000";
  insertRow(db, "OINM", {
    ItemCode: p.itemCode,
    DocDate: p.docDate,
    DocTime: nowTime(),
    TransType: p.transType,
    InQty: p.direction > 0 ? p.qty : 0,
    OutQty: p.direction < 0 ? p.qty : 0,
    Warehouse: whs,
    CreatedBy: p.docEntry,
    DocLineNum: p.lineNum,
    CardCode: p.cardCode,
    CardName: p.cardName,
    Comments: p.comments ?? null,
    OcrCode: p.ocrCode ?? null,
  });
  const delta = p.direction * p.qty;
  const touched = db
    .prepare(
      `UPDATE "OITW" SET "OnHand" = "OnHand" + ? WHERE "ItemCode" = ? AND "WhsCode" = ?`,
    )
    .run(delta, p.itemCode, whs);
  if (touched.changes === 0) {
    insertRow(db, "OITW", {
      ItemCode: p.itemCode,
      WhsCode: whs,
      OnHand: delta,
    });
  }
  db.prepare(
    `UPDATE "OITM" SET "OnHand" = "OnHand" + ? WHERE "ItemCode" = ?`,
  ).run(delta, p.itemCode);
}

// ── 공개 API (documents.ts 가 호출) ──────────────────────────
export interface EngineLine {
  ItemCode: string;
  Quantity: number;
  Price?: number;
  VatGroup?: string;
  ShipDate?: string;
  WarehouseCode?: string;
  CostingCode?: string;
  LineNum?: number;
  udf?: Record<string, string | number | null>;
}

export interface EngineHeader {
  CardCode: string;
  CardName?: string;
  DocCurrency?: string;
  DocDate?: string;
  DocDueDate?: string;
  BPLId?: number;
  SalesPersonCode?: number;
  NumAtCard?: string;
  PaymentGroupCode?: number;
  JournalMemo?: string;
  comments?: string;
  udf?: Record<string, string | number | null>;
}

export interface EngineCreated {
  DocEntry: number;
  DocNum: number;
}

/** 밑바닥 생성 (Orders / PurchaseOrders) */
export function engineCreate(
  entity: string,
  h: EngineHeader,
  lines: EngineLine[],
): EngineCreated {
  const db = getDb();
  const def = entityDef(entity);
  if (!lines.length) throw new Error("문서 라인이 비어 있습니다.");

  const card = db
    .prepare(`SELECT "CardName" FROM "OCRD" WHERE "CardCode" = ?`)
    .get(h.CardCode) as { CardName: string } | undefined;
  if (!card) throw new Error(`거래처를 찾을 수 없습니다: ${h.CardCode}`);

  const tx = db.transaction((): EngineCreated => {
    const { docEntry, docNum } = nextIds(db, def.header);
    const docDate = h.DocDate ?? today();
    let docTotal = 0;
    let vatTotal = 0;

    lines.forEach((l, i) => {
      const item = db
        .prepare(
          `SELECT "ItemName", "AvgPrice" FROM "OITM" WHERE "ItemCode" = ?`,
        )
        .get(l.ItemCode) as { ItemName: string; AvgPrice: number } | undefined;
      if (!item) throw new Error(`품목을 찾을 수 없습니다: ${l.ItemCode}`);
      const price = l.Price ?? Number(item.AvgPrice) ?? 0;
      const lineTotal = Math.round(l.Quantity * price);
      const vat = Math.round((lineTotal * vatRate(db, l.VatGroup)) / 100);
      docTotal += lineTotal + vat;
      vatTotal += vat;
      insertRow(db, def.line, {
        DocEntry: docEntry,
        LineNum: i,
        ItemCode: l.ItemCode,
        Dscription: item.ItemName,
        Quantity: l.Quantity,
        OpenQty: l.Quantity,
        unitMsr: "EA",
        Price: price,
        DiscPrcnt: 0,
        VatGroup: l.VatGroup ?? null,
        LineTotal: lineTotal,
        VatSum: vat,
        GTotal: lineTotal + vat,
        ShipDate: l.ShipDate ?? null,
        WhsCode: l.WarehouseCode ?? null,
        OcrCode: l.CostingCode ?? null,
        LineStatus: "O",
        BaseType: -1,
        BaseEntry: null,
        BaseLine: null,
        ...pickUdf(db, def.line, l.udf),
      });
    });

    insertRow(db, def.header, {
      DocEntry: docEntry,
      DocNum: docNum,
      DocDate: docDate,
      DocDueDate: h.DocDueDate ?? docDate,
      TaxDate: docDate,
      CardCode: h.CardCode,
      CardName: h.CardName ?? card.CardName,
      NumAtCard: h.NumAtCard ?? null,
      DocCur: h.DocCurrency ?? "KRW",
      DocRate: 1,
      DocTotal: docTotal,
      DocTotalFC: 0,
      VatSum: vatTotal,
      DiscSum: 0,
      PaidToDate: 0,
      GroupNum: h.PaymentGroupCode ?? -1,
      SlpCode: h.SalesPersonCode ?? -1,
      BPLId: h.BPLId ?? null,
      Comments: h.comments ?? null,
      JrnlMemo: h.JournalMemo ?? null,
      CreateDate: today(),
      DocStatus: "O",
      CANCELED: "N",
      TransId: null,
      ...pickUdf(db, def.header, h.udf),
    });

    recomputeCommitments(
      db,
      lines.map((l) => l.ItemCode),
    );
    return { DocEntry: docEntry, DocNum: docNum };
  });
  // immediate: 채번(MAX+1)을 읽기 전에 쓰기락을 잡는다 — 프로세스가 둘 이상이면 PK 충돌한다
  return tx.immediate();
}

/** 수정 (PATCH 전체 라인 교체 의미론 — 이월분 보존 검증 포함) */
export function engineUpdate(
  entity: string,
  docEntry: number,
  h: Pick<
    EngineHeader,
    | "DocDueDate"
    | "NumAtCard"
    | "PaymentGroupCode"
    | "JournalMemo"
    | "comments"
    | "udf"
  >,
  lines: EngineLine[],
): void {
  const db = getDb();
  const def = entityDef(entity);
  if (!lines.length) throw new Error("문서 라인이 비어 있습니다.");

  const tx = db.transaction(() => {
    const head = db
      .prepare(
        `SELECT "DocStatus", "CANCELED", "DocDate" FROM "${def.header}" WHERE "DocEntry" = ?`,
      )
      .get(docEntry) as
      { DocStatus: string; CANCELED: string; DocDate: string } | undefined;
    if (!head) throw new Error("문서를 찾을 수 없습니다.");
    if (head.CANCELED === "Y")
      throw new Error("취소된 문서는 수정할 수 없습니다.");
    if (head.DocStatus === "C")
      throw new Error("닫힌 문서는 수정할 수 없습니다.");

    const oldLines = db
      .prepare(
        `SELECT "LineNum", "ItemCode", "WhsCode", "Quantity", "OpenQty" FROM "${def.line}" WHERE "DocEntry" = ?`,
      )
      .all(docEntry) as {
      LineNum: number;
      ItemCode: string;
      WhsCode: string | null;
      Quantity: number;
      OpenQty: number;
    }[];
    const oldByNum = new Map(oldLines.map((l) => [l.LineNum, l]));
    const keptNums = new Set(
      lines.filter((l) => l.LineNum != null).map((l) => l.LineNum),
    );
    for (const old of oldLines) {
      const drawn = Number(old.Quantity) - Number(old.OpenQty);
      if (drawn > 0 && !keptNums.has(old.LineNum)) {
        throw new Error(
          `이월(후속문서 반영)된 라인은 삭제할 수 없습니다. (라인 ${old.LineNum + 1})`,
        );
      }
    }

    db.prepare(`DELETE FROM "${def.line}" WHERE "DocEntry" = ?`).run(docEntry);

    let docTotal = 0;
    let vatTotal = 0;
    let anyOpen = false;
    // 삭제된 라인의 품목도 약정 재계산 대상이다
    const touchedItems: string[] = oldLines.map((l) => l.ItemCode);
    // 신규 라인 채번은 기존 최대 LineNum 다음부터 — 배열 인덱스를 쓰면 기존 번호와 충돌한다
    let nextLineNum =
      oldLines.reduce((max, l) => Math.max(max, l.LineNum), -1) + 1;
    lines.forEach((l, i) => {
      const item = db
        .prepare(
          `SELECT "ItemName", "AvgPrice" FROM "OITM" WHERE "ItemCode" = ?`,
        )
        .get(l.ItemCode) as { ItemName: string; AvgPrice: number } | undefined;
      if (!item) throw new Error(`품목을 찾을 수 없습니다: ${l.ItemCode}`);
      const old = l.LineNum != null ? oldByNum.get(l.LineNum) : undefined;
      const drawn = old ? Number(old.Quantity) - Number(old.OpenQty) : 0;
      if (l.Quantity < drawn) {
        throw new Error(
          `이미 이월된 수량(${drawn})보다 적게 줄일 수 없습니다. (라인 ${(l.LineNum ?? i) + 1})`,
        );
      }
      // 🔴 이월분이 있는 라인은 **정체성**을 바꿀 수 없다. LineNum 만 같고 품목·창고가 바뀌면
      //    후속문서(BaseLine 참조)는 옛 품목을 출고한 채로 남아 재고·약정이 영구히 어긋난다.
      if (old && drawn > 0) {
        if (l.ItemCode !== old.ItemCode) {
          throw new Error(
            `이월된 라인의 품목은 변경할 수 없습니다. (라인 ${old.LineNum + 1}: ${old.ItemCode} → ${l.ItemCode})`,
          );
        }
        if ((l.WarehouseCode ?? null) !== (old.WhsCode ?? null)) {
          throw new Error(
            `이월된 라인의 창고는 변경할 수 없습니다. (라인 ${old.LineNum + 1}: ${old.WhsCode ?? "-"} → ${l.WarehouseCode ?? "-"})`,
          );
        }
      }
      const openQty = l.Quantity - drawn;
      if (openQty > 0) anyOpen = true;
      const price = l.Price ?? Number(item.AvgPrice) ?? 0;
      const lineTotal = Math.round(l.Quantity * price);
      const vat = Math.round((lineTotal * vatRate(db, l.VatGroup)) / 100);
      docTotal += lineTotal + vat;
      vatTotal += vat;
      touchedItems.push(l.ItemCode);
      if (old) touchedItems.push(old.ItemCode);
      insertRow(db, def.line, {
        DocEntry: docEntry,
        LineNum: old ? old.LineNum : nextLineNum++,
        ItemCode: l.ItemCode,
        Dscription: item.ItemName,
        Quantity: l.Quantity,
        OpenQty: openQty,
        unitMsr: "EA",
        Price: price,
        DiscPrcnt: 0,
        VatGroup: l.VatGroup ?? null,
        LineTotal: lineTotal,
        VatSum: vat,
        GTotal: lineTotal + vat,
        ShipDate: l.ShipDate ?? null,
        WhsCode: l.WarehouseCode ?? null,
        OcrCode: l.CostingCode ?? null,
        LineStatus: openQty > 0 ? "O" : "C",
        BaseType: -1,
        BaseEntry: null,
        BaseLine: null,
        ...pickUdf(db, def.line, l.udf),
      });
    });

    db.prepare(
      `UPDATE "${def.header}" SET
         "DocDueDate" = ?, "NumAtCard" = ?, "GroupNum" = ?, "JrnlMemo" = ?, "Comments" = ?,
         "DocTotal" = ?, "VatSum" = ?, "DocStatus" = ?
       WHERE "DocEntry" = ?`,
    ).run(
      h.DocDueDate ?? head.DocDate,
      h.NumAtCard ?? null,
      h.PaymentGroupCode ?? -1,
      h.JournalMemo ?? null,
      h.comments ?? null,
      docTotal,
      vatTotal,
      anyOpen ? "O" : "C",
      docEntry,
    );
    const udf = pickUdf(db, def.header, h.udf);
    for (const [k, v] of Object.entries(udf)) {
      db.prepare(
        `UPDATE "${def.header}" SET "${k}" = ? WHERE "DocEntry" = ?`,
      ).run(v, docEntry);
    }
    recomputeCommitments(db, touchedItems);
  });
  tx.immediate();
}

export interface EngineDrawLine {
  BaseType: number;
  BaseEntry: number;
  BaseLine: number;
  Quantity: number;
  udf?: Record<string, string | number | null>;
}

/** 문서연결 생성 — base 라인 복사 + OpenQty 차감 + 재고/분개 반영 */
export function engineCreateFromBase(
  entity: string,
  h: Pick<
    EngineHeader,
    "CardCode" | "DocDate" | "DocDueDate" | "NumAtCard" | "comments" | "udf"
  >,
  lines: EngineDrawLine[],
): EngineCreated {
  const db = getDb();
  const def = entityDef(entity);
  if (!lines.length) throw new Error("이월할 라인이 없습니다.");

  const tx = db.transaction((): EngineCreated => {
    const { docEntry, docNum } = nextIds(db, def.header);
    const docDate = h.DocDate ?? today();
    let docTotal = 0;
    let vatTotal = 0;
    let headerSrc: Record<string, unknown> | null = null;
    const touchedItems: string[] = [];
    const baseHeaders = new Set<string>();

    lines.forEach((l, i) => {
      const baseDef = byObjType(l.BaseType);
      const base = db
        .prepare(
          `SELECT * FROM "${baseDef.line}" WHERE "DocEntry" = ? AND "LineNum" = ?`,
        )
        .get(l.BaseEntry, l.BaseLine) as Record<string, unknown> | undefined;
      if (!base)
        throw new Error(
          `상위문서 라인을 찾을 수 없습니다. (${baseDef.label} ${l.BaseEntry}/${l.BaseLine})`,
        );
      const bh = db
        .prepare(`SELECT * FROM "${baseDef.header}" WHERE "DocEntry" = ?`)
        .get(l.BaseEntry) as Record<string, unknown> | undefined;
      if (!bh)
        throw new Error(
          `상위문서를 찾을 수 없습니다. (${baseDef.label} ${l.BaseEntry})`,
        );
      if (bh.CANCELED === "Y")
        throw new Error(
          `취소된 상위문서입니다. (${baseDef.label} ${bh.DocNum})`,
        );
      if (String(bh.CardCode) !== h.CardCode) {
        throw new Error("상위문서와 거래처가 다릅니다.");
      }
      const openQty = Number(base.OpenQty);
      if (base.LineStatus !== "O" || openQty <= 0) {
        throw new Error(
          `이미 마감된 상위 라인입니다. (${baseDef.label} ${bh.DocNum} 라인 ${l.BaseLine + 1})`,
        );
      }
      if (l.Quantity > openQty) {
        throw new Error(
          `이월 수량(${l.Quantity})이 미결 수량(${openQty})을 초과합니다. (라인 ${l.BaseLine + 1})`,
        );
      }
      headerSrc ??= bh;

      const price = Number(base.Price);
      const lineTotal = Math.round(l.Quantity * price);
      const vat = Math.round(
        (lineTotal * vatRate(db, base.VatGroup as string | null)) / 100,
      );
      docTotal += lineTotal + vat;
      vatTotal += vat;
      touchedItems.push(String(base.ItemCode));

      insertRow(db, def.line, {
        DocEntry: docEntry,
        LineNum: i,
        ItemCode: base.ItemCode,
        Dscription: base.Dscription,
        Quantity: l.Quantity,
        OpenQty: l.Quantity,
        unitMsr: base.unitMsr ?? "EA",
        Price: price,
        DiscPrcnt: 0,
        VatGroup: base.VatGroup,
        LineTotal: lineTotal,
        VatSum: vat,
        GTotal: lineTotal + vat,
        ShipDate: base.ShipDate,
        WhsCode: base.WhsCode,
        OcrCode: base.OcrCode,
        LineStatus: "O",
        BaseType: l.BaseType,
        BaseEntry: l.BaseEntry,
        BaseLine: l.BaseLine,
        ...pickUdf(db, def.line, l.udf),
      });

      // base 라인 미결수량 차감 (전량 이월 시 라인 마감)
      const remain = openQty - l.Quantity;
      db.prepare(
        `UPDATE "${baseDef.line}" SET "OpenQty" = ?, "LineStatus" = ? WHERE "DocEntry" = ? AND "LineNum" = ?`,
      ).run(remain, remain > 0 ? "O" : "C", l.BaseEntry, l.BaseLine);
      baseHeaders.add(`${baseDef.header}:${l.BaseEntry}`);

      if (def.stock !== 0) {
        postStock(db, {
          itemCode: String(base.ItemCode),
          whsCode: (base.WhsCode as string | null) ?? null,
          qty: l.Quantity,
          direction: def.stock,
          transType: def.objType,
          docEntry,
          lineNum: i,
          docDate,
          cardCode: h.CardCode,
          cardName: String(bh.CardName ?? ""),
          ocrCode: (base.OcrCode as string | null) ?? null,
        });
      }
    });

    // 전 라인 마감된 base 헤더는 닫는다
    for (const key of baseHeaders) {
      const [table, entryStr] = key.split(":");
      const entry = Number(entryStr);
      const lineTable = Object.values(ENTITIES).find(
        (e) => e.header === table,
      )!.line;
      const open = db
        .prepare(
          `SELECT COUNT(*) AS n FROM "${lineTable}" WHERE "DocEntry" = ? AND "LineStatus" = 'O'`,
        )
        .get(entry) as { n: number };
      if (open.n === 0) {
        db.prepare(
          `UPDATE "${table}" SET "DocStatus" = 'C' WHERE "DocEntry" = ?`,
        ).run(entry);
      }
    }

    // 라인이 1개 이상임을 위에서 보장하므로 headerSrc 는 반드시 채워져 있다
    const src: Record<string, unknown> = headerSrc ?? {};
    let transId: number | null = null;
    if (def.jdtType != null) {
      transId = nextTransId(db);
      insertRow(db, "OJDT", {
        TransId: transId,
        RefDate: docDate,
        TransType: def.jdtType,
        LocTotal: docTotal,
        Memo: `${def.label} ${docNum} — ${String(src.CardName ?? "")}`,
      });
    }

    insertRow(db, def.header, {
      DocEntry: docEntry,
      DocNum: docNum,
      DocDate: docDate,
      DocDueDate: h.DocDueDate ?? docDate,
      TaxDate: docDate,
      CardCode: h.CardCode,
      CardName: src.CardName,
      NumAtCard: h.NumAtCard ?? null,
      DocCur: src.DocCur ?? "KRW",
      DocRate: 1,
      DocTotal: docTotal,
      DocTotalFC: 0,
      VatSum: vatTotal,
      DiscSum: 0,
      PaidToDate: 0,
      GroupNum: src.GroupNum ?? -1,
      SlpCode: src.SlpCode ?? -1,
      BPLId: src.BPLId ?? null,
      Comments: h.comments ?? null,
      JrnlMemo: src.JrnlMemo ?? null,
      CreateDate: today(),
      DocStatus: "O",
      CANCELED: "N",
      TransId: transId,
      ...pickUdf(db, def.header, h.udf),
    });

    recomputeCommitments(db, touchedItems);
    return { DocEntry: docEntry, DocNum: docNum };
  });
  // immediate: 채번(MAX+1)을 읽기 전에 쓰기락을 잡는다 — 프로세스가 둘 이상이면 PK 충돌한다
  return tx.immediate();
}

/** 취소 — 후속 문서 가드, base 미결수량 복원, 재고 역분개 */
export function engineCancel(entity: string, docEntry: number): void {
  const db = getDb();
  const def = entityDef(entity);

  const tx = db.transaction(() => {
    const head = db
      .prepare(`SELECT * FROM "${def.header}" WHERE "DocEntry" = ?`)
      .get(docEntry) as Record<string, unknown> | undefined;
    if (!head) throw new Error("문서를 찾을 수 없습니다.");
    if (head.CANCELED === "Y") throw new Error("이미 취소된 문서입니다.");

    // 후속 문서(미취소) 존재 시 취소 불가 — SL 업무규칙 재현
    for (const childLine of CHILD_LINES[def.objType] ?? []) {
      const childDef = Object.values(ENTITIES).find(
        (e) => e.line === childLine,
      )!;
      const child = db
        .prepare(
          `SELECT COUNT(*) AS n FROM "${childLine}" l
            JOIN "${childDef.header}" h ON h."DocEntry" = l."DocEntry"
           WHERE l."BaseType" = ? AND l."BaseEntry" = ? AND h."CANCELED" <> 'Y'`,
        )
        .get(def.objType, docEntry) as { n: number };
      if (child.n > 0) {
        throw new Error(
          `후속 문서(${childDef.label})가 있어 취소할 수 없습니다. 후속 문서를 먼저 취소하세요.`,
        );
      }
    }

    const lines = db
      .prepare(`SELECT * FROM "${def.line}" WHERE "DocEntry" = ?`)
      .all(docEntry) as Record<string, unknown>[];

    db.prepare(
      `UPDATE "${def.header}" SET "CANCELED" = 'Y', "DocStatus" = 'C' WHERE "DocEntry" = ?`,
    ).run(docEntry);
    db.prepare(
      `UPDATE "${def.line}" SET "LineStatus" = 'C', "OpenQty" = 0 WHERE "DocEntry" = ?`,
    ).run(docEntry);

    const touchedItems: string[] = [];
    const reopenedHeaders = new Set<string>();
    for (const l of lines) {
      touchedItems.push(String(l.ItemCode));
      // base 미결수량 복원
      const baseType = Number(l.BaseType);
      if (baseType > 0 && l.BaseEntry != null) {
        const baseDef = byObjType(baseType);
        db.prepare(
          `UPDATE "${baseDef.line}"
              SET "OpenQty" = MIN("Quantity", "OpenQty" + ?), "LineStatus" = 'O'
            WHERE "DocEntry" = ? AND "LineNum" = ?`,
        ).run(Number(l.Quantity), Number(l.BaseEntry), Number(l.BaseLine));
        reopenedHeaders.add(`${baseDef.header}:${l.BaseEntry}`);
      }
      // 재고 역분개
      if (def.stock !== 0) {
        postStock(db, {
          itemCode: String(l.ItemCode),
          whsCode: (l.WhsCode as string | null) ?? null,
          qty: Number(l.Quantity),
          direction: def.stock === -1 ? 1 : -1,
          transType: def.objType,
          docEntry,
          lineNum: Number(l.LineNum),
          // 🔴 역분개 전기일 = '취소일'이 아니라 **원문서 전기일**.
          //    취소일로 박으면 원전기와 역분개가 서로 다른 기간에 떨어져, 기간을 잘라 보는
          //    리포트(재고 입출고 대장)에서 한쪽 다리만 계상된다 — 생성+취소 왕복이 no-op 이
          //    아니게 되어 유령재고/과소재고가 생긴다(미래 전기일 문서를 오늘 취소한 경우).
          //    같은 날짜로 넣으면 어느 기간컷에서도 두 다리가 같이 잡혀 항상 상쇄된다.
          docDate: String(head.DocDate ?? today()),
          cardCode: String(head.CardCode ?? ""),
          cardName: String(head.CardName ?? ""),
          comments: "취소 역분개",
          // 원전기와 같은 코스트센터로 넣어야 수불 집계에서 상쇄된다
          ocrCode: (l.OcrCode as string | null) ?? null,
        });
      }
    }
    for (const key of reopenedHeaders) {
      const [table, entryStr] = key.split(":");
      db.prepare(
        `UPDATE "${table}" SET "DocStatus" = 'O' WHERE "DocEntry" = ? AND "CANCELED" <> 'Y'`,
      ).run(Number(entryStr));
    }

    if (def.jdtType != null && Number(head.DocTotal) !== 0) {
      insertRow(db, "OJDT", {
        TransId: nextTransId(db),
        RefDate: today(),
        TransType: def.jdtType,
        LocTotal: -Number(head.DocTotal),
        Memo: `${def.label} ${head.DocNum} 취소`,
      });
    }
    recomputeCommitments(db, touchedItems);
  });
  tx.immediate();
}

/** 엔진 헬스체크 — health 화면용 */
export function erpHealthCheck(): { ok: boolean; detail: string } {
  try {
    const db = getDb();
    const n = (
      db.prepare(`SELECT COUNT(*) AS n FROM "OITM"`).get() as { n: number }
    ).n;
    return {
      ok: true,
      detail: `로컬 ERP 엔진 정상 (품목 ${n}종 · 문서 엔티티 6종)`,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

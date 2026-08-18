/**
 * 조회 프로시저 TS 구현 — SQLite 엔 저장 프로시저가 없어 CF_* 의 **결과셋 계약을 그대로**
 * 재현한다 (두 재고 화면은 무수정).
 *
 * CF_STOCK(Gubun, SDT, EDT, ITEMCD, WHSCD, TYPE, CARDCD1, ETC)
 *  - Gubun='W' → 창고별 재고현황 
 *  - Gubun='J' → 재고전기리스트  — 4단 구성(기초/월소계/상세/연소계) + 누계.
 *    ⚠️ 원본 계약대로 수량 컬럼(INQTY·OUTQTY·Cumulated)은 **콤마 포맷 문자열**로 반환한다
 *      (화면이 parseNum 으로 콤마를 제거해 합산하고, 소계행은 DOCENTRY='' 로 판별).
 */
import { getDb } from "./sqlite";

const DEMO_PROCS = new Set(["CF_STOCK"]);
export const isDemoProc = (name: string): boolean =>
  DEMO_PROCS.has(name.toUpperCase());

const comma = (n: number): string =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 });

/** 'YYYYMMDD' → 'YYYY-MM-DD' (화면이 이 형식으로 넘긴다) */
function toIso(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s))
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

/** 문서유형 코드 → 한글 문서명 (DOCNAME) */
const DOC_NAME: Record<string, string> = {
  "13": "A/R송장",
  "14": "A/R대변메모",
  "15": "(판매)납품",
  "16": "(판매)반품",
  "17": "판매오더",
  "18": "A/P송장",
  "19": "A/P대변메모",
  "20": "입고PO",
  "21": "(구매)반품",
  "22": "구매오더",
  "58": "재고실사",
  "59": "기타입고",
  "60": "기타출고",
  "62": "재고재평가",
  "67": "재고이전",
  "1250000001": "재고이전요청",
  "310000001": "재고기초잔액",
};

export function callDemoProc(
  name: string,
  args: Array<string | number | null>,
): Record<string, unknown>[] {
  if (name.toUpperCase() !== "CF_STOCK") {
    throw new Error(`구현되지 않은 프로시저입니다: ${name}`);
  }
  const [gubun, sdt, edt, itemCd, whsCd, type, cardNm] = args.map((a) =>
    String(a ?? "").trim(),
  );
  return gubun === "J"
    ? inventoryPostingList({
        sdt: toIso(sdt),
        edt: toIso(edt),
        itemCd,
        whsCd,
        type,
        cardNm,
      })
    : warehouseStock({ edt: toIso(edt), itemCd, whsCd });
}

/** Gubun='W' — 창고별 재고현황  */
function warehouseStock(p: {
  edt: string;
  itemCd: string;
  whsCd: string;
}): Record<string, unknown>[] {
  const db = getDb();
  const where: string[] = [`COALESCE(w."Inactive",'N') <> 'Y'`];
  const params: (string | number)[] = [];
  if (p.itemCd) {
    where.push(`t."ItemCode" = ?`);
    params.push(p.itemCd);
  }
  if (p.whsCd) {
    where.push(`t."WhsCode" = ?`);
    params.push(p.whsCd);
  }

  // 기준일(edt)이 있으면 그 시점 재고를 원장으로 역산, 없으면 현재고
  const onHandExpr = p.edt
    ? `COALESCE((SELECT SUM(m."InQty" - m."OutQty") FROM "OINM" m
                  WHERE m."ItemCode" = t."ItemCode" AND m."Warehouse" = t."WhsCode" AND m."DocDate" <= ?), 0)`
    : `t."OnHand"`;
  const rows = db
    .prepare(
      `SELECT t."WhsCode", w."WhsName", t."ItemCode", i."ItemName",
              ${onHandExpr} AS "OnHand", t."IsCommited", t."OnOrder", i."FirmName"
         FROM "OITW" t
         JOIN "OWHS" w ON w."WhsCode" = t."WhsCode"
         JOIN "OITM" i ON i."ItemCode" = t."ItemCode"
        WHERE ${where.join(" AND ")}
        ORDER BY t."WhsCode", t."ItemCode"`,
    )
    .all(...(p.edt ? [p.edt, ...params] : params)) as {
    WhsCode: string;
    WhsName: string;
    ItemCode: string;
    ItemName: string;
    OnHand: number;
    IsCommited: number;
    OnOrder: number;
    FirmName: string | null;
  }[];

  return rows.map((r, i) => ({
    NUM: i + 1,
    WhsCode: r.WhsCode,
    WhsName: r.WhsName,
    ItemCode: r.ItemCode,
    ItemName: r.ItemName,
    OnHand: Number(r.OnHand),
    IsCommited: Number(r.IsCommited),
    OnOrder: Number(r.OnOrder),
    // 가용 = 재고 - 약정 (원본 계약: 포맷 문자열)
    GAYOUNG: comma(Number(r.OnHand) - Number(r.IsCommited)),
    FirmName: r.FirmName ?? "",
  }));
}

interface LedgerRow {
  ItemCode: string;
  DocDate: string;
  DocTime: number;
  TransType: number;
  InQty: number;
  OutQty: number;
  Warehouse: string;
  WhsName: string | null;
  CreatedBy: number;
  DocLineNum: number;
  CardCode: string | null;
  CardName: string | null;
  Comments: string | null;
  OcrCode: string | null;
  OcrName: string | null;
}

/** Gubun='J' — 재고전기리스트 : 기초 + 월별(상세 + 월소계) + 연소계, 누계 포함 */
function inventoryPostingList(p: {
  sdt: string;
  edt: string;
  itemCd: string;
  whsCd: string;
  type: string;
  cardNm: string;
}): Record<string, unknown>[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (p.itemCd) {
    where.push(`m."ItemCode" = ?`);
    params.push(p.itemCd);
  }
  if (p.whsCd) {
    where.push(`m."Warehouse" = ?`);
    params.push(p.whsCd);
  }
  if (p.type) {
    where.push(`m."TransType" = ?`);
    params.push(Number(p.type));
  }
  if (p.cardNm) {
    where.push(`COALESCE(m."CardName",'') LIKE ?`);
    params.push(`%${p.cardNm}%`);
  }
  const filter = where.length ? ` AND ${where.join(" AND ")}` : "";

  const select = `SELECT m."ItemCode", m."DocDate", m."DocTime", m."TransType", m."InQty", m."OutQty",
                         m."Warehouse", w."WhsName", m."CreatedBy", m."DocLineNum",
                         m."CardCode", m."CardName", m."Comments", m."OcrCode", o."OcrName"
                    FROM "OINM" m
                    LEFT JOIN "OWHS" w ON w."WhsCode" = m."Warehouse"
                    LEFT JOIN "OOCR" o ON o."OcrCode" = m."OcrCode"`;

  // 기초재고 = 조회 시작일 이전 누계
  const openingRow = p.sdt
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(m."InQty" - m."OutQty"),0) AS q FROM "OINM" m
            WHERE m."DocDate" < ?${filter}`,
        )
        .get(p.sdt, ...params) as { q: number })
    : { q: 0 };

  const detail = db
    .prepare(
      `${select} WHERE 1=1${p.sdt ? ` AND m."DocDate" >= ?` : ""}${p.edt ? ` AND m."DocDate" <= ?` : ""}${filter}
        ORDER BY m."DocDate", m."DocTime", m."TransSeq"`,
    )
    .all(
      ...[...(p.sdt ? [p.sdt] : []), ...(p.edt ? [p.edt] : []), ...params],
    ) as LedgerRow[];

  const out: Record<string, unknown>[] = [];
  let num = 1;
  let cumulative = Number(openingRow.q);
  let yearIn = 0;
  let yearOut = 0;

  const push = (row: Record<string, unknown>) =>
    out.push({ NUM: num++, ...row });
  /** 소계·기초 행 — DOCENTRY 를 비워 화면이 합계에서 제외한다 */
  const subtotal = (
    label: string,
    month: string,
    inQty: number,
    outQty: number,
  ) =>
    push({
      DOCMONTH: month,
      DOCDATE: "",
      DocTime: 0,
      TransType: "",
      DOCNAME: label,
      DOCENTRY: "",
      DOCLINE: "",
      ITEMCODE: null,
      WHSNAME: null,
      CARDCODE: null,
      CARDNAME: null,
      INQTY: inQty ? comma(inQty) : "",
      OUTQTY: outQty ? comma(outQty) : "",
      UOM: null,
      Comments: null,
      InvntAct: null,
      Cumulated: comma(cumulative),
      PrjCode: null,
      OcrCode: null,
      OcrName: null,
      PrjName: null,
      GLBPNM: null,
      GLBPCD: null,
    });

  subtotal("기초재고", p.sdt.slice(0, 7), 0, 0);

  let curMonth = "";
  let monthIn = 0;
  let monthOut = 0;
  const flushMonth = () => {
    if (curMonth) subtotal("월 소계", curMonth, monthIn, monthOut);
    monthIn = 0;
    monthOut = 0;
  };

  for (const r of detail) {
    const month = String(r.DocDate).slice(0, 7);
    if (month !== curMonth) {
      flushMonth();
      curMonth = month;
    }
    const inQty = Number(r.InQty);
    const outQty = Number(r.OutQty);
    cumulative += inQty - outQty;
    monthIn += inQty;
    monthOut += outQty;
    yearIn += inQty;
    yearOut += outQty;
    push({
      DOCMONTH: month,
      DOCDATE: String(r.DocDate).slice(0, 10),
      DocTime: Number(r.DocTime),
      TransType: String(r.TransType),
      DOCNAME: DOC_NAME[String(r.TransType)] ?? String(r.TransType),
      DOCENTRY: String(r.CreatedBy ?? ""),
      DOCLINE: String((Number(r.DocLineNum) || 0) + 1),
      ITEMCODE: r.ItemCode,
      WHSNAME: r.WhsName,
      CARDCODE: r.CardCode,
      CARDNAME: r.CardName,
      INQTY: inQty ? comma(inQty) : "",
      OUTQTY: outQty ? comma(outQty) : "",
      UOM: "EA",
      Comments: r.Comments,
      InvntAct: null,
      Cumulated: comma(cumulative),
      PrjCode: null,
      OcrCode: r.OcrCode,
      OcrName: r.OcrName,
      PrjName: null,
      GLBPNM: r.CardName,
      GLBPCD: r.CardCode,
    });
  }
  flushMonth();
  subtotal("연 누계", curMonth || p.edt.slice(0, 7), yearIn, yearOut);
  return out;
}

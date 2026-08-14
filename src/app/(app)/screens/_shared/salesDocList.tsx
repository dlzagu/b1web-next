/**
 * 판매 문서목록 공통 컬럼/조회조건 — 판매오더(orders) 기준으로 동종 문서목록(오더·송장·납품) 통일.
 * (rules.md [★공통조회프레임워크] 2026-07-13). 문서단위(헤더 1행) + 공통 풀 + 기본표시 6.
 * 문서별 고유컬럼(송장 기수금 등)은 각 page 에서 defaultHidden 으로 append.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { Column, SearchFieldDef } from "@/components/erp";

/** 판매문서 목록 공통 행 (헤더 필드) — 각 문서 page 의 Row 가 이 형태를 만족(SELECT 별칭 동일) */
export type SalesDocRow = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  TaxDate: string | null;
  CardCode: string;
  CardName: string | null;
  NumAtCard: string | null;
  SlpName: string | null;
  DocCur: string | null;
  DocTotal: number;
  DocTotalFC: number | null;
  VatSum: number | null;
  DiscSum: number | null;
  Comments: string | null;
  CreateDate: string | null;
  DocStatus: string;
  CANCELED: string;
};

/** 목록 SELECT 공통 컬럼(헤더 별칭 o.*, 영업사원명은 s."SlpName"). ORDR/OINV/ODLN 공통 표준필드. */
export const SALES_DOC_SELECT_COLS = `o."DocEntry", o."DocNum", o."DocDate", o."DocDueDate", o."TaxDate",
       o."CardCode", o."CardName", o."NumAtCard", s."SlpName", o."DocCur",
       o."DocTotal", o."DocTotalFC", o."VatSum", o."DiscSum", o."Comments", o."CreateDate",
       o."DocStatus", o."CANCELED"`;

export function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return "₩" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
export function ymd(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).slice(0, 10);
}
/** 목록 상태 배지 (취소/열림/닫힘) — 판매·구매 문서목록 공통 */
export function listStatusBadge(r: { DocStatus: string; CANCELED?: string | null }) {
  if (r.CANCELED === "Y") return <Badge variant="danger">취소</Badge>;
  if (r.DocStatus === "O") return <Badge variant="info">열림</Badge>;
  if (r.DocStatus === "C") return <Badge variant="neutral">닫힘</Badge>;
  return <Badge variant="neutral">{r.DocStatus}</Badge>;
}

/**
 * 판매문서 목록 공통 컬럼 풀 (기본표시 6: 문서번호·거래처명·전기일·납기일·금액·상태, 나머지 defaultHidden).
 * dueLabel — 납기/만기 등 문서별 라벨(오더=납기일, 송장=만기일).
 */
export function salesDocColumns<T extends SalesDocRow>(dueLabel = "납기일"): Column<T>[] {
  return [
    { key: "DocNum", header: "문서번호", width: "100px", align: "right" },
    { key: "CardCode", header: "거래처코드", width: "130px", defaultHidden: true, render: (r) => <span className="text-muted">{r.CardCode}</span> },
    { key: "CardName", header: "거래처명", render: (r) => r.CardName ?? "" },
    { key: "DocDate", header: "전기일", width: "110px", render: (r) => ymd(r.DocDate) },
    { key: "DocDueDate", header: dueLabel, width: "110px", render: (r) => ymd(r.DocDueDate) },
    { key: "TaxDate", header: "과세일", width: "110px", defaultHidden: true, render: (r) => ymd(r.TaxDate) },
    { key: "SlpName", header: "영업사원", width: "120px", defaultHidden: true, render: (r) => r.SlpName ?? "" },
    { key: "NumAtCard", header: "고객참조번호", width: "140px", defaultHidden: true, render: (r) => r.NumAtCard ?? "" },
    { key: "DocCur", header: "통화", width: "70px", align: "center", defaultHidden: true, render: (r) => r.DocCur ?? "" },
    { key: "DocTotal", header: "금액", align: "right", width: "140px", render: (r) => money(r.DocTotal) },
    { key: "VatSum", header: "부가세", align: "right", width: "120px", defaultHidden: true, render: (r) => money(r.VatSum) },
    { key: "DiscSum", header: "할인액", align: "right", width: "120px", defaultHidden: true, render: (r) => money(r.DiscSum) },
    {
      key: "DocTotalFC",
      header: "외화금액",
      align: "right",
      width: "130px",
      defaultHidden: true,
      render: (r) => (r.DocCur && r.DocCur !== "KRW" ? Number(r.DocTotalFC ?? 0).toLocaleString() : ""),
      sortValue: (r) => Number(r.DocTotalFC ?? 0),
    },
    { key: "Comments", header: "비고", width: "200px", defaultHidden: true, render: (r) => r.Comments ?? "" },
    { key: "CreateDate", header: "생성일", width: "110px", defaultHidden: true, render: (r) => ymd(r.CreateDate) },
    { key: "DocStatus", header: "상태", align: "center", width: "90px", render: listStatusBadge },
  ];
}

/**
 * 문서 상태 필터 공통 옵션 (판매·구매 6종 목록 공유).
 * "전체"=취소 제외(기본) · "전체(취소포함)"=취소까지 · 열림/닫힘=DocStatus. 취소 숨김 로직은 buildDocListWhere.
 */
export const DOC_STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "allc", label: "전체(취소포함)" },
  { value: "O", label: "열림" },
  { value: "C", label: "닫힘" },
];

/** 판매문서 목록 공통 조회조건 (거래처·문서번호·상태 + 전기일 범위 + 영업사원 선택). */
export const SALES_DOC_SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "cardcode", label: "거래처", kind: "cfl", cflType: "Customer", placeholder: "거래처 선택" },
  { name: "docnum", label: "문서번호", kind: "text", placeholder: "문서번호" },
  {
    name: "status",
    label: "상태",
    kind: "select",
    options: DOC_STATUS_OPTIONS,
  },
  { name: "datefrom", label: "전기일(시작)", kind: "date" },
  { name: "dateto", label: "전기일(종료)", kind: "date" },
  { name: "slpcode", label: "영업사원", kind: "cfl", cflType: "SalesEmployee", placeholder: "영업사원 선택", defaultShown: false },
  // 라인 마스터 조건(이 값이 든 라인이 있는 문서만) — 전부 기본 숨김
  { name: "itemcode", label: "품목", kind: "cfl", cflType: "Item", placeholder: "품목 선택 (이 품목이 든 문서)", defaultShown: false },
  { name: "itemgroup", label: "품목분류", kind: "cfl", cflType: "ItemGroup", placeholder: "품목분류 선택", defaultShown: false },
  { name: "whscode", label: "창고", kind: "cfl", cflType: "Warehouse", placeholder: "창고 선택", defaultShown: false },
  { name: "ocrcode", label: "코스트센터", kind: "cfl", cflType: "CostCenter", placeholder: "코스트센터 선택", defaultShown: false },
  { name: "vatgroup", label: "세금그룹", kind: "cfl", cflType: "VatGroupSales", placeholder: "세금그룹 선택", defaultShown: false },
];

/** 전기일 기본 범위: 당해년 1/1 ~ 오늘 */
export function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 문서목록 공통 조회조건(searchParams) 형태 — 헤더별칭 o 기준 WHERE 를 만든다. */
export type DocListSearch = {
  cardcode?: string;
  docnum?: string;
  status?: string;
  slpcode?: string;
  /** 라인 마스터 조건(라인테이블 EXISTS) — 품목·품목분류·창고·코스트센터·세금그룹 */
  itemcode?: string;
  itemgroup?: string;
  whscode?: string;
  ocrcode?: string;
  vatgroup?: string;
  datefrom?: string;
  dateto?: string;
  /** 보기 모드 — "line"이면 라인별(문서×라인 조인), 그 외 문서별(기본) */
  view?: string;
};

const DOC_IDENT_RE = /^[A-Za-z0-9_]+$/;

/**
 * 문서목록 공통 WHERE 빌더 (판매·구매 6종 공통, 파라미터 바인딩).
 * 거래처 LIKE · 문서번호 = · 상태(O/C) · 영업사원 = · 품목(라인 EXISTS) · 전기일 범위(기본 당해년1/1~오늘).
 * @param opts.lineTable 품목(itemcode) 조건에 쓸 라인 테이블(RDR1/DLN1/INV1/POR1/PDN1/PCH1). 없으면 품목조건 무시.
 * @returns whereSql(빈 조건이면 ""), params(? 바인딩 순서), values(정규화된 값 — SearchBar values 로 그대로 사용)
 */
export function buildDocListWhere(
  sp: DocListSearch,
  opts?: { lineTable?: string; lineMode?: boolean },
): {
  whereSql: string;
  params: (string | number)[];
  values: Required<Omit<DocListSearch, "view">>;
} {
  const cardcode = sp.cardcode?.trim() ?? "";
  const docnum = sp.docnum?.trim() ?? "";
  const status = sp.status ?? "";
  const slpcode = sp.slpcode?.trim() ?? "";
  const itemcode = sp.itemcode?.trim() ?? "";
  const itemgroup = sp.itemgroup?.trim() ?? "";
  const whscode = sp.whscode?.trim() ?? "";
  const ocrcode = sp.ocrcode?.trim() ?? "";
  const vatgroup = sp.vatgroup?.trim() ?? "";
  const datefrom = sp.datefrom?.trim() || yearStart();
  const dateto = sp.dateto?.trim() || todayStr();

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (cardcode) {
    where.push(`o."CardCode" LIKE ?`);
    params.push("%" + cardcode + "%");
  }
  if (docnum) {
    const n = Number(docnum);
    if (Number.isFinite(n)) {
      where.push(`o."DocNum" = ?`);
      params.push(n);
    }
  }
  // 취소건은 기본 숨김 — "전체(취소포함)"(allc) 선택 시에만 포함. NULL CANCELED = 미취소로 간주.
  if (status !== "allc") {
    where.push(`COALESCE(o."CANCELED", 'N') <> 'Y'`);
  }
  if (status === "O" || status === "C") {
    where.push(`o."DocStatus" = ?`);
    params.push(status);
  }
  if (slpcode) {
    const n = Number(slpcode);
    if (Number.isFinite(n)) {
      where.push(`o."SlpCode" = ?`);
      params.push(n);
    }
  }
  // 라인 마스터 조건(품목·창고·코스트센터·세금그룹). 컬럼명은 하드코딩(안전).
  const lineCols: { col: string; val: string }[] = [];
  if (itemcode) lineCols.push({ col: "ItemCode", val: itemcode });
  if (whscode) lineCols.push({ col: "WhsCode", val: whscode });
  if (ocrcode) lineCols.push({ col: "OcrCode", val: ocrcode });
  if (vatgroup) lineCols.push({ col: "VatGroup", val: vatgroup });
  if (opts?.lineMode) {
    // 라인별 보기 — 라인(l)에 직접 조건. 해당 라인만 남김.
    for (const c of lineCols) {
      where.push(`l."${c.col}" = ?`);
      params.push(c.val);
    }
    if (itemgroup) {
      where.push(`l."ItemCode" IN (SELECT "ItemCode" FROM "OITM" WHERE "U_ItemGR1" = ?)`);
      params.push(itemgroup);
    }
  } else if (opts?.lineTable && DOC_IDENT_RE.test(opts.lineTable)) {
    // 문서별 보기 — 조건 만족 라인이 하나라도 있는 문서만. 단일 EXISTS(중복 없음). 품목분류는 라인→OITM 조인.
    const lineConds = lineCols.map((c) => `ln."${c.col}" = ?`);
    const lineParams = lineCols.map((c) => c.val);
    if (itemgroup) {
      lineConds.push(`it."U_ItemGR1" = ?`);
      lineParams.push(itemgroup);
    }
    if (lineConds.length) {
      const joinSql = itemgroup ? ` JOIN "OITM" it ON it."ItemCode" = ln."ItemCode"` : "";
      where.push(`EXISTS (SELECT 1 FROM "${opts.lineTable}" ln${joinSql} WHERE ln."DocEntry" = o."DocEntry" AND ${lineConds.join(" AND ")})`);
      params.push(...lineParams);
    }
  }
  if (datefrom) {
    where.push(`TO_VARCHAR(o."DocDate",'YYYY-MM-DD') >= ?`);
    params.push(datefrom);
  }
  if (dateto) {
    where.push(`TO_VARCHAR(o."DocDate",'YYYY-MM-DD') <= ?`);
    params.push(dateto);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return {
    whereSql,
    params,
    values: { cardcode, docnum, status, slpcode, itemcode, itemgroup, whscode, ocrcode, vatgroup, datefrom, dateto },
  };
}

// ── 라인별 보기 (문서×라인 조인) ──────────────────────────────
export function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/** 라인별 보기 SELECT 컬럼 (헤더 o + 영업사원 s + 라인 l + 창고 w). 마케팅문서 라인 공통(별칭 고정). */
export const SALES_DOC_LINE_SELECT_COLS = `o."DocEntry", o."DocNum", o."DocDate", o."CardCode", o."CardName", s."SlpName",
       o."DocStatus", o."CANCELED",
       l."LineNum", l."ItemCode", l."Dscription", l."Quantity", l."Price", l."LineTotal",
       l."VatGroup", l."WhsCode", w."WhsName", l."OcrCode", l."LineStatus"`;

/** 라인별 보기 행 (문서 헤더 + 라인 1건). rowKey = DocEntry-LineNum */
export type DocLineListRow = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  CardCode: string;
  CardName: string | null;
  SlpName: string | null;
  DocStatus: string;
  CANCELED: string;
  LineNum: number;
  ItemCode: string;
  Dscription: string | null;
  Quantity: number;
  Price: number;
  LineTotal: number;
  VatGroup: string | null;
  WhsCode: string;
  WhsName: string | null;
  OcrCode: string | null;
  LineStatus: string;
};

/**
 * 라인별 보기 컬럼 풀 (기본표시: 문서번호·거래처명·전기일·품목코드·품목명·수량·금액·문서상태).
 * 확장(defaultHidden): 거래처코드·영업사원·라인#·단가·세금그룹·창고·코스트센터·라인상태.
 */
export function salesDocLineColumns<T extends DocLineListRow>(partnerLabel = "거래처"): Column<T>[] {
  return [
    { key: "DocNum", header: "문서번호", width: "100px", align: "right" },
    { key: "CardCode", header: `${partnerLabel}코드`, width: "130px", defaultHidden: true, render: (r) => <span className="text-muted">{r.CardCode}</span> },
    { key: "CardName", header: `${partnerLabel}명`, render: (r) => r.CardName ?? "" },
    { key: "DocDate", header: "전기일", width: "110px", render: (r) => ymd(r.DocDate) },
    { key: "SlpName", header: "영업사원", width: "120px", defaultHidden: true, render: (r) => r.SlpName ?? "" },
    { key: "LineNum", header: "라인", width: "60px", align: "right", defaultHidden: true, render: (r) => r.LineNum + 1 },
    { key: "ItemCode", header: "품목코드", width: "150px" },
    { key: "Dscription", header: "품목명", render: (r) => r.Dscription ?? "" },
    { key: "Quantity", header: "수량", align: "right", width: "90px", render: (r) => num(r.Quantity) },
    { key: "Price", header: "단가", align: "right", width: "120px", defaultHidden: true, render: (r) => money(r.Price) },
    { key: "LineTotal", header: "금액", align: "right", width: "130px", render: (r) => money(r.LineTotal) },
    { key: "VatGroup", header: "세금그룹", align: "center", width: "90px", defaultHidden: true, render: (r) => r.VatGroup ?? "-" },
    {
      key: "WhsCode",
      header: "창고",
      width: "140px",
      defaultHidden: true,
      render: (r) => (
        <span>
          <span className="text-muted">{r.WhsCode}</span> {r.WhsName ?? ""}
        </span>
      ),
      sortValue: (r) => r.WhsName ?? r.WhsCode,
    },
    { key: "OcrCode", header: "코스트센터", width: "110px", defaultHidden: true, render: (r) => r.OcrCode ?? "-" },
    {
      key: "LineStatus",
      header: "라인상태",
      align: "center",
      width: "90px",
      defaultHidden: true,
      render: (r) => (r.LineStatus === "O" ? <Badge variant="info">열림</Badge> : <Badge variant="neutral">닫힘</Badge>),
    },
    { key: "DocStatus", header: "문서상태", align: "center", width: "90px", render: listStatusBadge },
  ];
}

// ── 목록 하단 합계 바 (표시 행 SUM — 그리드 하단 고정 footer) ──────────────
function TotalsBar({ count, unit, children }: { count: number; unit: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-card border border-border bg-surface-2 px-4 py-2 text-sm">
      <span className="mr-auto text-muted">
        합계 <span className="font-semibold tabular-nums text-foreground">{count.toLocaleString()}</span>
        {unit}
      </span>
      {children}
    </div>
  );
}
function TotalItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted">
      {label} <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

/**
 * 문서별 보기 합계 바 — 건수 + 합계금액(SUM DocTotal). VatSum 있으면 공급가액·부가세도.
 * 판매·구매 6종 목록 doc-view 공통(모든 헤더행에 DocTotal 존재). rows 없으면 null.
 */
export function docListFooter(rows: { DocTotal?: number | null; VatSum?: number | null }[]): ReactNode {
  if (!rows.length) return null;
  let total = 0;
  let vat = 0;
  let hasVat = false;
  for (const r of rows) {
    total += Number(r.DocTotal ?? 0);
    if (r.VatSum !== null && r.VatSum !== undefined) {
      vat += Number(r.VatSum);
      hasVat = true;
    }
  }
  return (
    <TotalsBar count={rows.length} unit="건">
      {hasVat && <TotalItem label="공급가액" value={money(total - vat)} />}
      {hasVat && <TotalItem label="부가세" value={money(vat)} />}
      <TotalItem label="합계금액" value={money(total)} />
    </TotalsBar>
  );
}

/** 라인별 보기 합계 바 — 행수 + 수량합계 + 금액합계(SUM LineTotal). rows 없으면 null. */
export function lineListFooter(rows: DocLineListRow[]): ReactNode {
  if (!rows.length) return null;
  let qty = 0;
  let amt = 0;
  for (const r of rows) {
    qty += Number(r.Quantity ?? 0);
    amt += Number(r.LineTotal ?? 0);
  }
  return (
    <TotalsBar count={rows.length} unit="행">
      <TotalItem label="수량" value={num(qty)} />
      <TotalItem label="금액" value={money(amt)} />
    </TotalsBar>
  );
}

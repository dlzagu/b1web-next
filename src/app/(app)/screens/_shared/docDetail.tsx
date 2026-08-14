/**
 * 문서 상세(DocBase식) 공통 — 헬퍼·라인컬럼·UDF 병합·헤더UDF필드·합계푸터.
 * 판매/구매 문서 상세화면(orders·deliveries·invoices·purchase-*)이 공유하는 프레젠테이션 조각.
 * (rules.md [★DRY-공통함수화] / [★문서화면 필드선택+UDF])
 *   - money/num/ymd/docStatusBadge : 상세 공통 포맷·상태배지
 *   - docLineColumns(opts)          : DocBase 라인 컬럼 풀(표준 + 확장 defaultHidden)
 *   - withUdfColumns / udfHeaderFields : CUFD UDF 를 컬럼·헤더필드로 동적 병합(기본 숨김)
 *   - DocTotalsFooter               : 하단 합계 바(수량·공급가액·부가세·합계)
 * ※ 서버 전용(udf.ts server-only 의존) — 상세 page.tsx(서버 컴포넌트)에서만 import.
 */
import { Badge } from "@/components/ui";
import type { Column, FieldDef } from "@/components/erp";
import { udfText, type UdfDef } from "@/lib/db/udf";

export function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return "₩" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
export function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
export function ymd(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

/** 문서 상세 상태 배지 (취소됨/미결/마감) — DocBase 상세 공통 */
export function docStatusBadge(status: string, canceled: string) {
  if (canceled === "Y") return <Badge variant="danger">취소됨</Badge>;
  if (status === "O") return <Badge variant="info">미결</Badge>;
  if (status === "C") return <Badge variant="neutral">마감</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

/** 문서 라인 공통행(표준필드) — 각 문서 라인 SELECT 별칭이 이 형태를 만족 */
export type DocLineRow = {
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  Quantity: number;
  unitMsr: string | null;
  Price: number;
  DiscPrcnt: number | null;
  VatGroup?: string | null;
  LineTotal: number;
  VatSum?: number | null;
  GTotal?: number | null;
  ShipDate?: string | null;
  WhsCode: string;
  WhsName: string | null;
  OcrCode?: string | null;
  LineStatus: string;
};

/**
 * DocBase 라인 컬럼 풀.
 * 기본표시: #·품목코드·품목명·수량·단가·세금그룹·공급가액·세액·총계·[납품예정일]·창고·라인상태
 * 확장(defaultHidden): 단위·할인%·코스트센터
 * @param opts.shipDate 납품예정일 컬럼 포함(판매오더·납품 = true)
 */
export function docLineColumns<T extends DocLineRow>(opts?: { shipDate?: boolean }): Column<T>[] {
  const cols: Column<T>[] = [
    { key: "LineNum", header: "#", align: "right", width: "48px", render: (r) => r.LineNum + 1 },
    { key: "ItemCode", header: "품목코드", width: "150px" },
    { key: "Dscription", header: "품목명" },
    { key: "Quantity", header: "수량", align: "right", width: "90px", render: (r) => num(r.Quantity) },
    { key: "Price", header: "단가", align: "right", width: "120px", render: (r) => money(r.Price) },
    { key: "VatGroup", header: "세금그룹", align: "center", width: "90px", render: (r) => r.VatGroup ?? "-" },
    { key: "LineTotal", header: "공급가액", align: "right", width: "130px", render: (r) => money(r.LineTotal) },
    { key: "VatSum", header: "세액", align: "right", width: "120px", render: (r) => money(r.VatSum) },
    { key: "GTotal", header: "총계", align: "right", width: "130px", render: (r) => money(r.GTotal) },
  ];
  if (opts?.shipDate) {
    cols.push({ key: "ShipDate", header: "납품예정일", width: "110px", render: (r) => ymd(r.ShipDate) });
  }
  cols.push(
    {
      key: "WhsCode",
      header: "창고",
      width: "140px",
      render: (r) => (
        <span>
          <span className="text-muted">{r.WhsCode}</span> {r.WhsName ?? ""}
        </span>
      ),
      sortValue: (r) => r.WhsName ?? r.WhsCode,
    },
    // 확장 컬럼 (기본 숨김 — 사용자가 [컬럼]에서 켤 수 있음)
    { key: "unitMsr", header: "단위", align: "center", width: "70px", render: (r) => r.unitMsr ?? "-", defaultHidden: true },
    {
      key: "DiscPrcnt",
      header: "할인%",
      align: "right",
      width: "70px",
      render: (r) => (r.DiscPrcnt ? `${num(r.DiscPrcnt)}%` : "-"),
      defaultHidden: true,
    },
    { key: "OcrCode", header: "코스트센터", width: "110px", render: (r) => r.OcrCode ?? "-", defaultHidden: true },
    {
      key: "LineStatus",
      header: "라인상태",
      align: "center",
      width: "80px",
      render: (r) => (r.LineStatus === "O" ? <Badge variant="info">열림</Badge> : <Badge variant="neutral">닫힘</Badge>),
    },
  );
  return cols;
}

/** 라인 컬럼에 CUFD UDF 컬럼(기본 숨김)을 병합 */
export function withUdfColumns<T extends DocLineRow>(cols: Column<T>[], lineUdfs: UdfDef[]): Column<T>[] {
  return [
    ...cols,
    ...lineUdfs.map(
      (u): Column<T> => ({
        key: u.column,
        header: u.label,
        width: "130px",
        render: (r) => udfText((r as Record<string, unknown>)[u.column]),
        defaultHidden: true,
      }),
    ),
  ];
}

/** 헤더 UDF 필드(FieldSet 용, 전부 기본 숨김) — CUFD 정의 동적 */
export function udfHeaderFields(udfs: UdfDef[], header: Record<string, unknown>): FieldDef[] {
  return udfs.map((u): FieldDef => ({ key: u.column, label: u.label, node: udfText(header[u.column]), defaultHidden: true }));
}

/** 문서 하단 합계 바 (수량·공급가액·부가세·합계) — DocBase 상세/폼 공통 */
export function DocTotalsFooter({
  qty,
  supply,
  vat,
  total,
}: {
  qty: number;
  supply: number;
  vat: number | null | undefined;
  total: number | null | undefined;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 rounded-card bg-surface-2 px-5 py-3 text-sm">
      <span>
        <span className="text-muted">수량</span> <span className="font-semibold tabular-nums">{num(qty)}</span>
      </span>
      <span>
        <span className="text-muted">공급가액</span> <span className="font-semibold tabular-nums">{money(supply)}</span>
      </span>
      <span>
        <span className="text-muted">부가세</span> <span className="font-semibold tabular-nums">{money(vat)}</span>
      </span>
      <span>
        <span className="text-muted">합계</span> <span className="font-bold tabular-nums">{money(total)}</span>
      </span>
    </div>
  );
}

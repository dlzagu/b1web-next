/**
 * 매출 세금계산서 목록 (OINV) — 판매 문서목록 공통 정본(salesDocList). 문서별/라인별 보기 전환(ViewToggle).
 * 문서별: 공통 풀 + 송장 고유(기수금·미결잔액) defaultHidden. 라인별: 문서×라인.
 */
import Link from "next/link";
import { PageHeader, SearchBar, DataGrid, type Column } from "@/components/erp";
import { buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";
import {
  salesDocColumns,
  SALES_DOC_SELECT_COLS,
  SALES_DOC_SEARCH_FIELDS,
  buildDocListWhere,
  docListFooter,
  money,
  type SalesDocRow,
  type DocListSearch,
} from "../_shared/salesDocList";
import { ViewToggle } from "../_shared/ViewToggle";
import DocLineListView from "../_shared/DocLineListView";

export const dynamic = "force-dynamic";

type InvoiceRow = SalesDocRow & { PaidToDate: number };

// 공통 컬럼(만기일) + 송장 고유 기수금·미결잔액(기본 숨김)
const COLUMNS: Column<InvoiceRow>[] = [
  ...salesDocColumns<InvoiceRow>("만기일"),
  { key: "PaidToDate", header: "기수금", align: "right", width: "120px", defaultHidden: true, render: (r) => money(r.PaidToDate) },
  {
    key: "balance",
    header: "미결잔액",
    align: "right",
    width: "130px",
    defaultHidden: true,
    render: (r) => money(Number(r.DocTotal) - Number(r.PaidToDate)),
    sortValue: (r) => Number(r.DocTotal) - Number(r.PaidToDate),
  },
];

const MAX_DISPLAY = 200;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<DocListSearch>;
}) {
  const sp = await searchParams;
  const view = sp.view === "line" ? "line" : "doc";
  const { whereSql, params, values } = buildDocListWhere(sp, { lineTable: "INV1", lineMode: view === "line" });

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키 (레이아웃이 인증 게이트)
  const uid = user?.uid ?? "anon";

  let rows: InvoiceRow[] = [];
  let error: string | null = null;
  if (view === "doc") {
    try {
      rows = await query<InvoiceRow>(
        `SELECT TOP ${MAX_DISPLAY} ${SALES_DOC_SELECT_COLS}, o."PaidToDate"
         FROM "OINV" o
         LEFT JOIN "OSLP" s ON s."SlpCode" = o."SlpCode"
         ${whereSql}
         ORDER BY o."DocDate" DESC, o."DocNum" DESC`,
        params,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="매출 세금계산서"
        description="OINV · A/R 송장"
        actions={
          <Link href="/screens/invoices/new" className={buttonVariants({ size: "sm" })}>
            + 신규 (납품 연결)
          </Link>
        }
      />

      <SearchBar
        fields={SALES_DOC_SEARCH_FIELDS}
        values={values}
        storageKey={`b1w:search:invoices:${uid}`}
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <ViewToggle value={view} />
      </div>

      {view === "line" ? (
        <DocLineListView
          headerTable="OINV"
          lineTable="INV1"
          whereSql={whereSql}
          params={params}
          storageNs="invoices"
          rowHrefBase="/screens/invoices"
          partnerLabel="거래처"
          uid={uid}
        />
      ) : error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}건{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<InvoiceRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocEntry}
            rowHref={(r) => `/screens/invoices/${r.DocEntry}`}
            emptyText="조건에 맞는 세금계산서가 없습니다."
            storageKey={`b1w:cols:invoices:${uid}`}
            footer={docListFooter(rows)}
          />
        </>
      )}
    </div>
  );
}

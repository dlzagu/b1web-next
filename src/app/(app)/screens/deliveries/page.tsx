/**
 * 납품 목록 (ODLN) — 판매 문서목록 공통 정본(salesDocList). 문서별/라인별 보기 전환(ViewToggle).
 * 문서단위(헤더 1행) 또는 라인단위(문서×라인). 오더·송장과 컬럼 일치.
 */
import Link from "next/link";
import { PageHeader, SearchBar, DataGrid } from "@/components/erp";
import { buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";
import {
  salesDocColumns,
  SALES_DOC_SELECT_COLS,
  SALES_DOC_SEARCH_FIELDS,
  buildDocListWhere,
  docListFooter,
  type SalesDocRow,
  type DocListSearch,
} from "../_shared/salesDocList";
import { ViewToggle } from "../_shared/ViewToggle";
import DocLineListView from "../_shared/DocLineListView";

export const dynamic = "force-dynamic";

const COLUMNS = salesDocColumns<SalesDocRow>("납기일");
const MAX_DISPLAY = 200;

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<DocListSearch>;
}) {
  const sp = await searchParams;
  const view = sp.view === "line" ? "line" : "doc";
  const { whereSql, params, values } = buildDocListWhere(sp, { lineTable: "DLN1", lineMode: view === "line" });

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키
  const uid = user?.uid ?? "anon";

  let rows: SalesDocRow[] = [];
  let error: string | null = null;
  if (view === "doc") {
    try {
      rows = await query<SalesDocRow>(
        `SELECT TOP ${MAX_DISPLAY} ${SALES_DOC_SELECT_COLS}
         FROM "ODLN" o
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
        title="납품 현황"
        description="ODLN · 납품"
        actions={
          <Link href="/screens/deliveries/new" className={buttonVariants({ size: "sm" })}>
            + 신규 (오더 연결)
          </Link>
        }
      />

      <SearchBar
        fields={SALES_DOC_SEARCH_FIELDS}
        values={values}
        storageKey={`b1w:search:deliveries:${uid}`}
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <ViewToggle value={view} />
      </div>

      {view === "line" ? (
        <DocLineListView
          headerTable="ODLN"
          lineTable="DLN1"
          whereSql={whereSql}
          params={params}
          storageNs="deliveries"
          rowHrefBase="/screens/deliveries"
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
          <DataGrid<SalesDocRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocEntry}
            rowHref={(r) => `/screens/deliveries/${r.DocEntry}`}
            emptyText="조건에 맞는 납품이 없습니다."
            storageKey={`b1w:cols:deliveries:${uid}`}
            footer={docListFooter(rows)}
          />
        </>
      )}
    </div>
  );
}

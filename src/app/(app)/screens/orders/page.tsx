/**
 * 판매오더 목록 (ORDR) — 판매 문서목록 공통 정본(salesDocList). 문서별/라인별 보기 전환(ViewToggle).
 * 컬럼 풀·조회조건·기본표시는 _shared/salesDocList 로 통일(송장·납품도 동일 기준). storageKey 로 사용자별 선택 저장.
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<DocListSearch>;
}) {
  const sp = await searchParams;
  const view = sp.view === "line" ? "line" : "doc";
  const { whereSql, params, values } = buildDocListWhere(sp, { lineTable: "RDR1", lineMode: view === "line" });

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키 (레이아웃이 인증 게이트)
  const uid = user?.uid ?? "anon";

  let rows: SalesDocRow[] = [];
  let error: string | null = null;
  if (view === "doc") {
    try {
      rows = await query<SalesDocRow>(
        `SELECT TOP ${MAX_DISPLAY} ${SALES_DOC_SELECT_COLS}
         FROM "ORDR" o
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
        title="판매오더"
        description="ORDR · 판매오더"
        actions={
          <Link href="/screens/orders/new" className={buttonVariants({ size: "sm" })}>
            + 신규 주문
          </Link>
        }
      />

      <SearchBar
        fields={SALES_DOC_SEARCH_FIELDS}
        values={values}
        storageKey={`b1w:search:orders:${uid}`}
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <ViewToggle value={view} />
      </div>

      {view === "line" ? (
        <DocLineListView
          headerTable="ORDR"
          lineTable="RDR1"
          whereSql={whereSql}
          params={params}
          storageNs="orders"
          rowHrefBase="/screens/orders"
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
            rowHref={(r) => `/screens/orders/${r.DocEntry}`}
            emptyText="조건에 맞는 판매오더가 없습니다."
            storageKey={`b1w:cols:orders:${uid}`}
            footer={docListFooter(rows)}
          />
        </>
      )}
    </div>
  );
}

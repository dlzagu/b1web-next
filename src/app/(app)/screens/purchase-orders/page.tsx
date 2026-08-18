/**
 * 구매오더 목록 (OPOR) — 공통 조회 프레임워크. 문서별/라인별 보기 전환(ViewToggle).
 * ※ OPOR(구매오더 헤더)에는 CardType 컬럼 없음(거래처=항상 공급처).
 */
import Link from "next/link";
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";
import { money, ymd, buildDocListWhere, listStatusBadge, docListFooter, DOC_STATUS_OPTIONS, type DocListSearch } from "../_shared/salesDocList";
import { ViewToggle } from "../_shared/ViewToggle";
import DocLineListView from "../_shared/DocLineListView";

export const dynamic = "force-dynamic";

type PurchaseOrderRow = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string | null;
  CardCode: string;
  CardName: string | null;
  DocTotal: number;
  DocStatus: string;
  CANCELED: string | null;
};

const COLUMNS: Column<PurchaseOrderRow>[] = [
  // 문서번호는 식별자 — 천단위 콤마 금지(정렬은 align:"right" 로 숫자 유지)
  { key: "DocNum", header: "문서번호", width: "100px", align: "right", render: (r) => String(r.DocNum ?? "") },
  { key: "CardCode", header: "공급처코드", width: "130px", defaultHidden: true, render: (r) => <span className="text-muted">{r.CardCode}</span> },
  { key: "CardName", header: "공급처명", render: (r) => r.CardName ?? "" },
  { key: "DocDate", header: "전기일", width: "110px", render: (r) => ymd(r.DocDate) },
  { key: "DocDueDate", header: "납기일", width: "110px", render: (r) => ymd(r.DocDueDate) },
  { key: "DocTotal", header: "금액", align: "right", width: "140px", render: (r) => money(r.DocTotal) },
  { key: "DocStatus", header: "상태", align: "center", width: "90px", render: listStatusBadge },
];

const MAX_DISPLAY = 200;

const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "cardcode", label: "거래처(공급처)", kind: "cfl", cflType: "Vendor", placeholder: "공급처 선택" },
  { name: "docnum", label: "문서번호", kind: "text", placeholder: "문서번호" },
  {
    name: "status",
    label: "상태",
    kind: "select",
    options: DOC_STATUS_OPTIONS,
  },
  { name: "datefrom", label: "전기일(시작)", kind: "date" },
  { name: "dateto", label: "전기일(종료)", kind: "date" },
  // 라인 마스터 조건(이 값이 든 라인이 있는 문서만) — 전부 기본 숨김
  { name: "itemcode", label: "품목", kind: "cfl", cflType: "Item", placeholder: "품목 선택 (이 품목이 든 문서)", defaultShown: false },
  { name: "itemgroup", label: "품목분류", kind: "cfl", cflType: "ItemGroup", placeholder: "품목분류 선택", defaultShown: false },
  { name: "whscode", label: "창고", kind: "cfl", cflType: "Warehouse", placeholder: "창고 선택", defaultShown: false },
  { name: "ocrcode", label: "코스트센터", kind: "cfl", cflType: "CostCenter", placeholder: "코스트센터 선택", defaultShown: false },
  { name: "vatgroup", label: "세금그룹", kind: "cfl", cflType: "VatGroupPurchase", placeholder: "세금그룹 선택", defaultShown: false },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<DocListSearch>;
}) {
  const sp = await searchParams;
  const view = sp.view === "line" ? "line" : "doc";
  const { whereSql, params, values } = buildDocListWhere(sp, { lineTable: "POR1", lineMode: view === "line" });

  const user = await getSession();
  const uid = user?.uid ?? "anon";

  let rows: PurchaseOrderRow[] = [];
  let error: string | null = null;
  if (view === "doc") {
    try {
      rows = await query<PurchaseOrderRow>(
        `SELECT TOP ${MAX_DISPLAY} o."DocEntry", o."DocNum", o."DocDate", o."DocDueDate",
                o."CardCode", o."CardName", o."DocTotal", o."DocStatus", o."CANCELED"
         FROM "OPOR" o
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
        title="구매오더"
        description="OPOR · 구매오더"
        actions={
          <Link href="/screens/purchase-orders/new" className={buttonVariants({ size: "sm" })}>
            + 신규 구매오더
          </Link>
        }
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={values}
        storageKey={`b1w:search:purchase-orders:${uid}`}
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <ViewToggle value={view} />
      </div>

      {view === "line" ? (
        <DocLineListView
          headerTable="OPOR"
          lineTable="POR1"
          whereSql={whereSql}
          params={params}
          storageNs="purchase-orders"
          rowHrefBase="/screens/purchase-orders"
          partnerLabel="공급처"
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
          <DataGrid<PurchaseOrderRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocEntry}
            rowHref={(r) => `/screens/purchase-orders/${r.DocEntry}`}
            emptyText="조건에 맞는 구매오더가 없습니다."
            storageKey={`b1w:cols:purchase-orders:${uid}`}
            footer={docListFooter(rows)}
          />
        </>
      )}
    </div>
  );
}

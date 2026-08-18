/**
 * 창고 재고 조회 (첫 파일럿 조회화면 / 조회 템플릿 1호)
 * 데이터: CF_STOCK(Gubun='W', ...) — 원본 창고재고 화면 대응.
 * 패턴: searchParams → callProc(화이트리스트) → DataGrid. Gubun/TYPE 등은 서버 고정(클라이언트 미노출).
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { callProc } from "@/lib/db/proc";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type StockRow = {
  NUM: number;
  WhsCode: string;
  WhsName: string;
  ItemCode: string;
  ItemName: string;
  OnHand: number;
  IsCommited: number;
  OnOrder: number;
  GAYOUNG: string; // 가용 (프로시저가 문자열로 포맷 반환)
  FirmName: string;
};

const COLUMNS: Column<StockRow>[] = [
  { key: "WhsCode", header: "창고", width: "90px" },
  { key: "WhsName", header: "창고명", width: "200px" },
  { key: "ItemCode", header: "품목코드", width: "140px" },
  { key: "ItemName", header: "품명" },
  { key: "OnHand", header: "재고", align: "right" },
  { key: "IsCommited", header: "약정", align: "right" },
  { key: "OnOrder", header: "오더", align: "right" },
  { key: "GAYOUNG", header: "가용", align: "right" },
  { key: "FirmName", header: "제조사", width: "140px" },
];

const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "edt", label: "기준일", kind: "date" },
  { name: "whs", label: "창고", kind: "cfl", cflType: "Warehouse", placeholder: "창고 선택" },
  { name: "item", label: "품목", kind: "cfl", cflType: "Item", placeholder: "품목 선택" },
];

const MAX_DISPLAY = 500;

export default async function WarehouseStockPage({
  searchParams,
}: {
  searchParams: Promise<{ whs?: string; item?: string; edt?: string }>;
}) {
  const sp = await searchParams;
  const whs = sp.whs?.trim() ?? "";
  const item = sp.item?.trim() ?? "";
  const edt = sp.edt?.trim() ?? "";
  const user = await getSession();

  let rows: StockRow[] = [];
  let error: string | null = null;
  try {
    // CF_STOCK(Gubun,SDT,EDT,ITEMCD,WHSCD,TYPE,CARDCD,ETC) — Gubun/SDT/TYPE/CARDCD/ETC 서버 고정
    const all = await callProc<StockRow>("CF_STOCK", ["W", "", edt, item, whs, "", "", ""]);
    rows = all.slice(0, MAX_DISPLAY);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="창고 재고 조회" description="CF_STOCK (Gubun=W)" />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ edt, whs, item }}
        storageKey={`b1w:search:warehouse-stock:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}건{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<StockRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r, i) => `${r.WhsCode}-${r.ItemCode}-${i}`}
            emptyText="조건에 맞는 재고가 없습니다."
            storageKey={`b1w:cols:warehouse-stock:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

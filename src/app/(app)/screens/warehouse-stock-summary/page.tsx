/**
 * 창고 재고 요약 (레퍼런스 정밀복제)
 * 데이터: OITW(품목-창고 재고) 직접 SELECT. 레거시 소스에는 이 화면 전용 Controller/JSP가
 * 없어(메뉴 등록만 존재하는 미구현 화면), 원본의 화면 메타(대상 테이블 OITW)
 * 컬럼 메타를 근거로 재구성.
 * (로컬 스펙 문서 uncertainties 참조 — 역설계 확정사항/추정 구분)
 * 패턴: 조회 목록 화면 복제 (force-dynamic, 동적 WHERE 조립 + 파라미터 바인딩).
 */
import { PageHeader, SearchPanel, SearchField, DataGrid, type Column } from "@/components/erp";
import { Badge } from "@/components/ui";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type StockRow = {
  ItemCode: string;
  ItemName: string | null;
  WhsCode: string;
  WhsName: string | null;
  OnHand: number;
  IsCommited: number;
  OnOrder: number;
  Available: number;
  MinStock: number;
  MaxStock: number;
  WasCounted: string | null;
  Locked: string | null;
};

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const COLUMNS: Column<StockRow>[] = [
  { key: "ItemCode", header: "품목 코드", width: "140px" },
  {
    key: "ItemName",
    header: "품목명",
    // 코드가 아니라 이름 표시(OITM 조인). 이름 없으면 '-'.
    render: (r) => r.ItemName ?? "-",
  },
  { key: "WhsCode", header: "창고 코드", align: "center", width: "90px" },
  {
    key: "WhsName",
    header: "창고명",
    width: "180px",
    // 코드가 아니라 이름 표시(OWHS 조인). 미지정은 코드 폴백.
    render: (r) => r.WhsName ?? r.WhsCode ?? "-",
  },
  { key: "OnHand", header: "재고", align: "right", width: "100px", render: (r) => formatNumber(r.OnHand) },
  {
    key: "IsCommited",
    header: "정의(할당)",
    align: "right",
    width: "100px",
    render: (r) => formatNumber(r.IsCommited),
  },
  { key: "OnOrder", header: "오더(발주중)", align: "right", width: "100px", render: (r) => formatNumber(r.OnOrder) },
  {
    key: "Available",
    header: "가용재고",
    align: "right",
    width: "100px",
    render: (r) => formatNumber(r.Available),
  },
  { key: "MinStock", header: "최소 재고", align: "right", width: "100px", render: (r) => formatNumber(r.MinStock) },
  { key: "MaxStock", header: "최대 재고", align: "right", width: "100px", render: (r) => formatNumber(r.MaxStock) },
  {
    key: "WasCounted",
    header: "실사 여부",
    align: "center",
    width: "90px",
    render: (r) => (r.WasCounted === "Y" ? <Badge variant="info">실사됨</Badge> : <Badge variant="neutral">-</Badge>),
  },
  {
    key: "Locked",
    header: "잠김",
    align: "center",
    width: "80px",
    render: (r) => (r.Locked === "Y" ? <Badge variant="danger">잠김</Badge> : <Badge variant="neutral">-</Badge>),
  },
];

const MAX_DISPLAY = 200;

export default async function WarehouseStockSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sItemCode?: string; sWhsCode?: string; sIncludeZero?: string }>;
}) {
  const sp = await searchParams;
  const sItemCode = sp.sItemCode?.trim() ?? "";
  const sWhsCode = sp.sWhsCode?.trim() ?? "";
  const sIncludeZero = sp.sIncludeZero?.trim() === "Y" ? "Y" : "N";

  // 창고 select 옵션 — OWHS 전체
  let warehouses: { WhsCode: string; WhsName: string }[] = [];
  let rows: StockRow[] = [];
  let totals = { OnHand: 0, IsCommited: 0, OnOrder: 0, Available: 0 };
  let error: string | null = null;

  try {
    warehouses = await query<{ WhsCode: string; WhsName: string }>(
      `SELECT "WhsCode", "WhsName" FROM "OWHS" ORDER BY "WhsCode"`,
    );

    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 미입력 조건은 절 생략.
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (sItemCode) {
      where.push(`w."ItemCode" = ?`);
      params.push(sItemCode);
    }
    if (sWhsCode) {
      where.push(`w."WhsCode" = ?`);
      params.push(sWhsCode);
    }
    if (sIncludeZero !== "Y") {
      where.push(`w."OnHand" <> 0`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const all = await query<StockRow>(
      `SELECT TOP ${MAX_DISPLAY} w."ItemCode", m."ItemName", w."WhsCode", h."WhsName",
              w."OnHand", w."IsCommited", w."OnOrder", (w."OnHand" - w."IsCommited") AS "Available",
              w."MinStock", w."MaxStock", w."WasCounted", w."Locked"
       FROM "OITW" w
       LEFT JOIN "OITM" m ON m."ItemCode" = w."ItemCode"
       LEFT JOIN "OWHS" h ON h."WhsCode" = w."WhsCode"
       ${whereSql}
       ORDER BY w."ItemCode", w."WhsCode"`,
      params,
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    totals = rows.reduce(
      (acc, r) => ({
        OnHand: acc.OnHand + Number(r.OnHand ?? 0),
        IsCommited: acc.IsCommited + Number(r.IsCommited ?? 0),
        OnOrder: acc.OnOrder + Number(r.OnOrder ?? 0),
        Available: acc.Available + Number(r.Available ?? 0),
      }),
      { OnHand: 0, IsCommited: 0, OnOrder: 0, Available: 0 },
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="창고 재고 요약"
        description="OITW 기반 재구성 (원본은 메뉴만 존재)"
      />

      <SearchPanel>
        <SearchField label="품목코드" name="sItemCode" defaultValue={sItemCode} placeholder="품목코드" />
        <SearchField
          label="창고"
          name="sWhsCode"
          type="select"
          defaultValue={sWhsCode}
          options={[
            { value: "", label: "전체" },
            ...warehouses.map((w) => ({ value: w.WhsCode, label: `${w.WhsCode} ${w.WhsName}` })),
          ]}
        />
        <SearchField
          label="0재고 포함"
          name="sIncludeZero"
          type="select"
          defaultValue={sIncludeZero}
          options={[
            { value: "N", label: "재고 있는 항목만" },
            { value: "Y", label: "0재고 포함 전체" },
          ]}
        />
      </SearchPanel>

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
            getRowKey={(r) => `${r.ItemCode}::${r.WhsCode}`}
            emptyText="조건에 맞는 재고가 없습니다."
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={4} className="text-right font-bold">
                      합계
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totals.OnHand)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totals.IsCommited)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totals.OnOrder)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totals.Available)}</TD>
                    <TD colSpan={4} />
                  </TR>
                </TBody>
              </TableBare>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 품목별 매입 분석 — 품목별 매출 분석의 구매측 미러.
 * 차원: 품목(PCH1.ItemCode) / 원천: OPCH(헤더, CANCELED='N') JOIN PCH1(라인) / 측정: 수량 SUM, 매입액 SUM(LineTotal)
 * + 비중%(그룹매입액/전체매입액*100) + 합계행. 정렬 매입액 DESC.
 * ⚠️ 라인 기준(LineTotal=공급가)이라 헤더 기준(DocTotal=부가세 포함) 화면들과 합이 다른 것이 정상.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// 조회조건 풀 — 기존 SearchPanel 자식(CflField/SearchField)을 SearchFieldDef 로 이관. 마스터코드는 kind:"cfl".
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "sItemCode", label: "품목", kind: "cfl", cflType: "Item", placeholder: "품목 선택" },
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

type ItemPurchaseRow = {
  ItemCode: string;
  ItemName: string | null;
  Qty: number;
  PurchAmt: number;
};

function formatMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatQty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(v: number): string {
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// 기본 기간: 당해년 1월 1일 ~ 오늘 (YYYY-MM-DD)
function defaultFrom(): string {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
}
function defaultTo(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const MAX_DISPLAY = 200;

export default async function PurchaseByItemPage({
  searchParams,
}: {
  searchParams: Promise<{ sItemCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sItemCode = sp.sItemCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const user = await getSession();

  let rows: (ItemPurchaseRow & { pct: number })[] = [];
  let totalQty = 0;
  let totalAmt = 0;
  let error: string | null = null;

  try {
    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용, 품목코드는 미입력 시 절 생략.
    const where: string[] = [
      `i."CANCELED" = 'N'`,
      `TO_VARCHAR(i."DocDate",'YYYYMMDD') >= ?`,
      `TO_VARCHAR(i."DocDate",'YYYYMMDD') <= ?`,
    ];
    const params: (string | number)[] = [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")];
    if (sItemCode) {
      where.push(`l."ItemCode" LIKE ?`);
      params.push(`%${sItemCode}%`);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    // 품목별 집계: 수량 SUM, 매출액 SUM(LineTotal). HANA DECIMAL은 문자열 반환 -> TO_DECIMAL 캐스팅 후 SUM.
    const grouped = await query<ItemPurchaseRow>(
      `SELECT TOP ${MAX_DISPLAY} l."ItemCode",
              COALESCE(t."ItemName", l."Dscription") AS "ItemName",
              SUM(TO_DECIMAL(l."Quantity",21,4)) AS "Qty",
              SUM(TO_DECIMAL(l."LineTotal",21,4)) AS "PurchAmt"
       FROM "OPCH" i
       JOIN "PCH1" l ON l."DocEntry" = i."DocEntry"
       LEFT JOIN "OITM" t ON t."ItemCode" = l."ItemCode"
       ${whereSql}
       GROUP BY l."ItemCode", COALESCE(t."ItemName", l."Dscription")
       ORDER BY SUM(TO_DECIMAL(l."LineTotal",21,4)) DESC`,
      params,
    );

    // 전체 합계는 동일 필터로 별도 쿼리(비중% 분모 + 합계행 정합 — TOP 절단 영향 없음)
    const totalRows = await query<{ TotalQty: number; TotalAmt: number }>(
      `SELECT SUM(TO_DECIMAL(l."Quantity",21,4)) AS "TotalQty", SUM(TO_DECIMAL(l."LineTotal",21,4)) AS "TotalAmt"
       FROM "OPCH" i
       JOIN "PCH1" l ON l."DocEntry" = i."DocEntry"
       ${whereSql}`,
      params,
    );
    totalQty = Number(totalRows[0]?.TotalQty ?? 0);
    totalAmt = Number(totalRows[0]?.TotalAmt ?? 0);

    rows = grouped.map((r) => ({
      ...r,
      Qty: Number(r.Qty ?? 0),
      PurchAmt: Number(r.PurchAmt ?? 0),
      pct: totalAmt > 0 ? (Number(r.PurchAmt ?? 0) / totalAmt) * 100 : 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const COLUMNS: Column<ItemPurchaseRow & { pct: number }>[] = [
    { key: "ItemCode", header: "품목코드", width: "140px" },
    { key: "ItemName", header: "품목명", render: (r) => r.ItemName ?? "-" },
    { key: "Qty", header: "수량", align: "right", width: "100px", render: (r) => formatQty(r.Qty) },
    { key: "PurchAmt", header: "매입액", align: "right", width: "140px", render: (r) => formatMoney(r.PurchAmt) },
    { key: "pct", header: "비중", align: "right", width: "90px", render: (r) => formatPct(r.pct) },
  ];

  return (
    <div>
      <PageHeader
        title="품목별 매입 분석"
        description="품목별 매입 집계 — OPCH/PCH1 기반(매출 분석 미러)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sItemCode, searchFrom, searchTo }}
        storageKey={`b1w:search:purchase-by-item:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}개 품목{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<ItemPurchaseRow & { pct: number }>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.ItemCode}
            emptyText="조건에 맞는 매입 실적이 없습니다."
            storageKey={`b1w:cols:purchase-by-item:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={2} className="text-right font-bold">
                      전체 합계
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatQty(totalQty)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalAmt)}</TD>
                    <TD className="text-right font-bold tabular-nums">100.0%</TD>
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

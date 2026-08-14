/**
 * W3050 — 상품별 판매분석 (분석 리포트 · 재설계)
 * ⚠️ 레거시 원본 불일치(메뉴명 ≠ 실제 데이터소스, docs/conversion/specs/W3050.json 참조,
 * 이전 확정: 실제 SLayer='CreditNotes' → ORIN, '상품별' 집계 요소 전무한 dead menu 판정)로
 * 문서목록 재사용 대신 **메뉴명 의도 기준 GROUP BY 집계 리포트로 재설계**(사용자 승인 2026-07-06, rules.md
 * "분석 리포트 화면(집계형)" 섹션).
 * 차원: 품목(INV1.ItemCode) / 원천: OINV(헤더, CANCELED='N') JOIN INV1(라인) / 측정: 수량 SUM, 매출액 SUM(LineTotal)
 * + 비중%(그룹매출액/전체매출액*100) + 합계행. 정렬 매출액 DESC.
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

type ItemSalesRow = {
  ItemCode: string;
  ItemName: string | null;
  Qty: number;
  SalesAmt: number;
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

export default async function W3050Page({
  searchParams,
}: {
  searchParams: Promise<{ sItemCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sItemCode = sp.sItemCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const user = await getSession();

  let rows: (ItemSalesRow & { pct: number })[] = [];
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
    const grouped = await query<ItemSalesRow>(
      `SELECT TOP ${MAX_DISPLAY} l."ItemCode",
              COALESCE(t."ItemName", l."Dscription") AS "ItemName",
              SUM(TO_DECIMAL(l."Quantity",21,4)) AS "Qty",
              SUM(TO_DECIMAL(l."LineTotal",21,4)) AS "SalesAmt"
       FROM "OINV" i
       JOIN "INV1" l ON l."DocEntry" = i."DocEntry"
       LEFT JOIN "OITM" t ON t."ItemCode" = l."ItemCode"
       ${whereSql}
       GROUP BY l."ItemCode", COALESCE(t."ItemName", l."Dscription")
       ORDER BY SUM(TO_DECIMAL(l."LineTotal",21,4)) DESC`,
      params,
    );

    // 전체 합계는 동일 필터로 별도 쿼리(비중% 분모 + 합계행 정합 — TOP 절단 영향 없음)
    const totalRows = await query<{ TotalQty: number; TotalAmt: number }>(
      `SELECT SUM(TO_DECIMAL(l."Quantity",21,4)) AS "TotalQty", SUM(TO_DECIMAL(l."LineTotal",21,4)) AS "TotalAmt"
       FROM "OINV" i
       JOIN "INV1" l ON l."DocEntry" = i."DocEntry"
       ${whereSql}`,
      params,
    );
    totalQty = Number(totalRows[0]?.TotalQty ?? 0);
    totalAmt = Number(totalRows[0]?.TotalAmt ?? 0);

    rows = grouped.map((r) => ({
      ...r,
      Qty: Number(r.Qty ?? 0),
      SalesAmt: Number(r.SalesAmt ?? 0),
      pct: totalAmt > 0 ? (Number(r.SalesAmt ?? 0) / totalAmt) * 100 : 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const COLUMNS: Column<ItemSalesRow & { pct: number }>[] = [
    { key: "ItemCode", header: "품목코드", width: "140px" },
    { key: "ItemName", header: "품목명", render: (r) => r.ItemName ?? "-" },
    { key: "Qty", header: "수량", align: "right", width: "100px", render: (r) => formatQty(r.Qty) },
    { key: "SalesAmt", header: "매출액", align: "right", width: "140px", render: (r) => formatMoney(r.SalesAmt) },
    { key: "pct", header: "비중", align: "right", width: "90px", render: (r) => formatPct(r.pct) },
  ];

  return (
    <div>
      <PageHeader
        title="상품별 판매분석"
        description="W3050 · 품목별 매출 집계 리포트 — OINV/INV1 기반(신규 설계, docs/conversion/specs/W3050.json 참조)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sItemCode, searchFrom, searchTo }}
        storageKey={`b1w:search:W3050:${user?.uid ?? "anon"}`}
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
          <DataGrid<ItemSalesRow & { pct: number }>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.ItemCode}
            emptyText="조건에 맞는 판매 실적이 없습니다."
            storageKey={`b1w:cols:W3050:${user?.uid ?? "anon"}`}
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

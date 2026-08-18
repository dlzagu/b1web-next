/**
 * 월별 매입 추이 — 월별 매출 추이의 구매측 미러.
 * 데이터: OPCH(AP송장 헤더, CANCELED='N')를 DocDate 기준 월별(YYYY-MM)로 GROUP BY 집계.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type PurchaseByPeriodRow = {
  YM: string;
  DocCnt: number;
  SumTotal: number;
};

type PurchaseByPeriodDisplayRow = PurchaseByPeriodRow & { Ratio: number };

function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString();
}

function formatRatio(v: number): string {
  return `${v.toFixed(1)}%`;
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

const COLUMNS: Column<PurchaseByPeriodDisplayRow>[] = [
  { key: "YM", header: "기간(월)", align: "center", width: "120px" },
  { key: "DocCnt", header: "전표건수", align: "right", width: "110px", render: (r) => formatNumber(r.DocCnt) },
  { key: "SumTotal", header: "매입액", align: "right", width: "170px", render: (r) => formatMoney(r.SumTotal) },
  { key: "Ratio", header: "비중(%)", align: "right", width: "110px", render: (r) => formatRatio(r.Ratio) },
];

const MAX_DISPLAY = 200;

// 조회조건 풀 — 기존 SearchPanel 의 전기일(시작/종료) 을 SearchFieldDef 로 이관. 전부 기본표시.
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

export default async function PurchaseMonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키

  let rows: PurchaseByPeriodDisplayRow[] = [];
  let totalCnt = 0;
  let totalSum = 0;
  let error: string | null = null;

  try {
    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용.
    const where: string[] = [
      `"CANCELED" = 'N'`,
      `TO_VARCHAR("DocDate",'YYYYMMDD') >= ?`,
      `TO_VARCHAR("DocDate",'YYYYMMDD') <= ?`,
    ];
    const params: (string | number)[] = [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")];
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const raw = await query<PurchaseByPeriodRow>(
      `SELECT TOP ${MAX_DISPLAY} TO_VARCHAR("DocDate",'YYYY-MM') AS "YM",
              COUNT(*) AS "DocCnt",
              SUM(TO_DECIMAL("DocTotal",21,2)) AS "SumTotal"
       FROM "OPCH"
       ${whereSql}
       GROUP BY TO_VARCHAR("DocDate",'YYYY-MM')
       ORDER BY "YM" ASC`,
      params,
    );

    // HANA DECIMAL은 문자열로 반환되므로 합계/비중 계산 전 Number() 강제 변환 필수
    totalCnt = raw.reduce((acc, r) => acc + Number(r.DocCnt ?? 0), 0);
    totalSum = raw.reduce((acc, r) => acc + Number(r.SumTotal ?? 0), 0);

    // 비중% = 각 행 매출액 / 전체 매출합 * 100
    rows = raw.map((r) => ({
      ...r,
      Ratio: totalSum > 0 ? (Number(r.SumTotal ?? 0) / totalSum) * 100 : 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="월별 매입 추이"
        description="월별 매입 집계 — OPCH 기반(매출 분석 미러)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ searchFrom, searchTo }}
        storageKey={`b1w:search:purchase-monthly:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}개월{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<PurchaseByPeriodDisplayRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.YM}
            emptyText="조건에 맞는 매입 데이터가 없습니다."
            storageKey={`b1w:cols:purchase-monthly:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD className="text-right font-bold">합계</TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totalCnt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalSum)}</TD>
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

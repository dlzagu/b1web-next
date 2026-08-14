/**
 * W3070 — 일일 매출현황 (분석 리포트 재설계)
 * 레거시 원본 부재(컨트롤러 미존재, dead menu — 상세는 이전 spec 참조) + 메뉴명이
 * '~현황(추이)'이므로 rules.md "분석 리포트 화면(집계형)" 룰에 따라 문서목록이 아닌
 * GROUP BY 집계 리포트로 재설계함(사용자 승인 2026-07-06).
 *
 * 차원: 일자(TO_VARCHAR(DocDate,'YYYY-MM-DD')). 원천: OINV(CANCELED='N').
 * 측정: 전표건수(COUNT DISTINCT DocEntry), 매출액(SUM DocTotal).
 * 누계: 일자 오름차순 기준 누적 합계(WINDOW SUM), 화면 표시는 일자 내림차순 유지.
 * CF_W3070 레거시 실버그(TOP1 결함·pCardGROUP/pItemGROUP 빈값 캐스팅 에러)는 재현하지 않음.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type DailySalesRow = {
  SalesDate: string;
  DocCount: number;
  SalesAmt: number;
  CumAmt: number;
};

function formatMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(v: string | null | undefined): string {
  if (!v) return "";
  // HANA DATE 는 "YYYY-MM-DD ..." 형태 문자열로 옴 — 앞 10자만 사용
  return String(v).slice(0, 10);
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

// 조회조건 풀 — 기존 검색필드를 SearchFieldDef 로 옮김.
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

const COLUMNS: Column<DailySalesRow>[] = [
  { key: "SalesDate", header: "일자", align: "center", width: "120px", render: (r) => formatDate(r.SalesDate) },
  { key: "DocCount", header: "전표건수", align: "right", width: "110px", render: (r) => formatInt(r.DocCount) },
  { key: "SalesAmt", header: "매출액", align: "right", width: "150px", render: (r) => formatMoney(r.SalesAmt) },
  { key: "CumAmt", header: "누계", align: "right", width: "160px", render: (r) => formatMoney(r.CumAmt) },
];

const MAX_DISPLAY = 200;

export default async function W3070Page({
  searchParams,
}: {
  searchParams: Promise<{ searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const user = await getSession();

  let rows: DailySalesRow[] = [];
  let sumDocCount = 0;
  let sumSalesAmt = 0;
  let error: string | null = null;

  try {
    // 기간은 항상 적용(파라미터 바인딩). GROUP BY 일자 + WINDOW SUM 으로 일자 오름차순 누계 계산 후,
    // 최종 표시는 일자 내림차순으로 재정렬(확정 설계).
    const all = await query<DailySalesRow>(
      `SELECT TOP ${MAX_DISPLAY} "SalesDate", "DocCount", "SalesAmt",
              SUM("SalesAmt") OVER (ORDER BY "SalesDate" ASC ROWS UNBOUNDED PRECEDING) AS "CumAmt"
       FROM (
         SELECT TO_VARCHAR(i."DocDate",'YYYY-MM-DD') AS "SalesDate",
                COUNT(DISTINCT i."DocEntry") AS "DocCount",
                SUM(TO_DECIMAL(i."DocTotal", 19, 2)) AS "SalesAmt"
         FROM "OINV" i
         WHERE i."CANCELED" = 'N'
           AND TO_VARCHAR(i."DocDate",'YYYYMMDD') >= ?
           AND TO_VARCHAR(i."DocDate",'YYYYMMDD') <= ?
         GROUP BY TO_VARCHAR(i."DocDate",'YYYY-MM-DD')
       )
       ORDER BY "SalesDate" DESC`,
      [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")],
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    sumDocCount = rows.reduce((acc, r) => acc + Number(r.DocCount ?? 0), 0);
    sumSalesAmt = rows.reduce((acc, r) => acc + Number(r.SalesAmt ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="일일 매출현황"
        description="W3070 · 일자별 매출 집계 — A/R송장(OINV) 기준(레거시 원본 부재, 메뉴명 기준 분석 리포트 재설계)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ searchFrom, searchTo }}
        storageKey={`b1w:search:W3070:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}일{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<DailySalesRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.SalesDate}
            emptyText="조건에 맞는 매출 내역이 없습니다."
            storageKey={`b1w:cols:W3070:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD className="text-right font-bold">합계</TD>
                    <TD className="text-right font-bold tabular-nums">{formatInt(sumDocCount)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(sumSalesAmt)}</TD>
                    <TD />
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

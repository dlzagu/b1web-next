/**
 * 일일 업무 요약 — 하루 단위로 판매·구매가 어디까지 흘렀는지 한 표로 본다.
 * 문서 목록이 아니라 **집계형 리포트**로 설계했다(같은 날짜의 주문·납품·매출을 나란히 비교하는 게 목적).
 *
 * 설계: 일자별 문서 크로스 요약. 차원=일자(DocDate).
 * 원천 3종 각각 GROUP BY DocDate 후 일자 기준으로 재집계(UNION ALL + 외부 GROUP BY
 * = FULL OUTER 결합과 동일 효과, HANA 구문 단순화):
 *   - ORDR(수주주문) → 주문건수·주문금액
 *   - ODLN(납품)     → 납품건수·납품금액
 *   - OINV(AR송장)   → 매출건수·매출금액
 * 정렬 일자 DESC. 필터: 기간(기본 당해년 1/1~오늘). 합계행 포함.
 * (로컬 스펙 문서 uncertainties 참조 — 역설계 확정사항 + 검증 실측치)
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type DailySummaryRow = {
  DocDate: string;
  OrdCnt: number;
  OrdAmt: number;
  DlnCnt: number;
  DlnAmt: number;
  InvCnt: number;
  InvAmt: number;
};

function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCount(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "0";
  return Number(v).toLocaleString();
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

const COLUMNS: Column<DailySummaryRow>[] = [
  { key: "DocDate", header: "일자", align: "center", width: "110px", render: (r) => formatDate(r.DocDate) },
  { key: "OrdCnt", header: "주문 건수", align: "right", width: "100px", render: (r) => formatCount(r.OrdCnt) },
  { key: "OrdAmt", header: "주문 금액", align: "right", width: "140px", render: (r) => formatMoney(r.OrdAmt) },
  { key: "DlnCnt", header: "납품 건수", align: "right", width: "100px", render: (r) => formatCount(r.DlnCnt) },
  { key: "DlnAmt", header: "납품 금액", align: "right", width: "140px", render: (r) => formatMoney(r.DlnAmt) },
  { key: "InvCnt", header: "매출 건수", align: "right", width: "100px", render: (r) => formatCount(r.InvCnt) },
  { key: "InvAmt", header: "매출 금액", align: "right", width: "140px", render: (r) => formatMoney(r.InvAmt) },
];

const MAX_DISPLAY = 200;

// 조회조건 풀 — 기존 검색필드를 SearchFieldDef 로 이관 (데이터 로직 무변경)
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "searchFrom", label: "일자(시작)", kind: "date" },
  { name: "searchTo", label: "일자(종료)", kind: "date" },
];

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const user = await getSession();

  let rows: DailySummaryRow[] = [];
  let totalOrdCnt = 0;
  let totalOrdAmt = 0;
  let totalDlnCnt = 0;
  let totalDlnAmt = 0;
  let totalInvCnt = 0;
  let totalInvAmt = 0;
  let error: string | null = null;

  try {
    // 기간 파라미터는 3개 서브쿼리에 각각 바인딩 (동일 값 6회 반복)
    const params: string[] = [searchFrom, searchTo, searchFrom, searchTo, searchFrom, searchTo];

    rows = await query<DailySummaryRow>(
      `SELECT TOP ${MAX_DISPLAY}
              D."DocDate",
              SUM(D."OrdCnt") AS "OrdCnt", SUM(D."OrdAmt") AS "OrdAmt",
              SUM(D."DlnCnt") AS "DlnCnt", SUM(D."DlnAmt") AS "DlnAmt",
              SUM(D."InvCnt") AS "InvCnt", SUM(D."InvAmt") AS "InvAmt"
       FROM (
         SELECT TO_VARCHAR("DocDate",'YYYY-MM-DD') AS "DocDate",
                COUNT(*) AS "OrdCnt", SUM(TO_DECIMAL("DocTotal",19,2)) AS "OrdAmt",
                0 AS "DlnCnt", 0 AS "DlnAmt", 0 AS "InvCnt", 0 AS "InvAmt"
         FROM "ORDR"
         WHERE "DocDate" >= ? AND "DocDate" <= ?
         GROUP BY TO_VARCHAR("DocDate",'YYYY-MM-DD')
         UNION ALL
         SELECT TO_VARCHAR("DocDate",'YYYY-MM-DD') AS "DocDate",
                0, 0, COUNT(*), SUM(TO_DECIMAL("DocTotal",19,2)), 0, 0
         FROM "ODLN"
         WHERE "DocDate" >= ? AND "DocDate" <= ?
         GROUP BY TO_VARCHAR("DocDate",'YYYY-MM-DD')
         UNION ALL
         SELECT TO_VARCHAR("DocDate",'YYYY-MM-DD') AS "DocDate",
                0, 0, 0, 0, COUNT(*), SUM(TO_DECIMAL("DocTotal",19,2))
         FROM "OINV"
         WHERE "DocDate" >= ? AND "DocDate" <= ?
         GROUP BY TO_VARCHAR("DocDate",'YYYY-MM-DD')
       ) D
       GROUP BY D."DocDate"
       ORDER BY D."DocDate" DESC`,
      params,
    );

    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    for (const r of rows) {
      totalOrdCnt += Number(r.OrdCnt ?? 0);
      totalOrdAmt += Number(r.OrdAmt ?? 0);
      totalDlnCnt += Number(r.DlnCnt ?? 0);
      totalDlnAmt += Number(r.DlnAmt ?? 0);
      totalInvCnt += Number(r.InvCnt ?? 0);
      totalInvAmt += Number(r.InvAmt ?? 0);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="일일 업무 요약"
        description="일자별 주문·납품·매출 크로스 요약"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ searchFrom, searchTo }}
        storageKey={`b1w:search:daily-summary:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}일{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}일만 표시)` : ""}
          </p>
          <DataGrid<DailySummaryRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocDate}
            emptyText="조건에 맞는 일일 업무 요약 데이터가 없습니다."
            storageKey={`b1w:cols:daily-summary:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD className="text-right font-bold">합계</TD>
                    <TD className="text-right font-bold tabular-nums">{formatCount(totalOrdCnt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalOrdAmt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatCount(totalDlnCnt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalDlnAmt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatCount(totalInvCnt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalInvAmt)}</TD>
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

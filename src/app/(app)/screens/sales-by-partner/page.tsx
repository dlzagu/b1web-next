/**
 * 거래처별 매출 분석 (신규 GROUP BY 집계 리포트로 재설계)
 *
 * 레거시(레퍼런스)는 컨트롤러가 SLayer='Returns'(ORIN 반품 헤더) 문서목록을 그대로 노출하는
 * dead/불일치 화면이었음(메뉴명 '~별 판매분석' vs 실제 '반품 문서목록', GROUP BY 없음).
 * docs/conversion/rules.md "분석 리포트 화면(집계형)" 룰 + 사용자 확정 설계에 따라
 * 메뉴명 의도(거래처별 매출 분석) 기준으로 신규 GROUP BY 집계 리포트로 재구현.
 *
 * 차원: 거래처(OINV.CardCode) / 측정값: 전표건수(COUNT), 매출액(SUM DocTotal) / 비중%(매출액/전체합*100)
 * 원천: OINV(AR송장 헤더), CANCELED='N'. 정렬: 매출액 DESC. 합계행: 전체 건수·매출액.
 * (로컬 스펙 문서 참조 — 재설계 확정사항)
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type CustomerSalesRow = {
  CardCode: string;
  CardName: string;
  DocCount: number;
  SalesAmount: number;
  Ratio: number;
};

function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString();
}

function formatRatio(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return `${Number(v).toFixed(1)}%`;
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

const COLUMNS: Column<CustomerSalesRow>[] = [
  { key: "CardCode", header: "거래처코드", width: "120px" },
  { key: "CardName", header: "거래처명" },
  {
    key: "DocCount",
    header: "전표건수",
    align: "right",
    width: "100px",
    render: (r) => formatNumber(r.DocCount),
  },
  {
    key: "SalesAmount",
    header: "매출액",
    align: "right",
    width: "150px",
    render: (r) => formatMoney(r.SalesAmount),
  },
  {
    key: "Ratio",
    header: "비중",
    align: "right",
    width: "90px",
    render: (r) => formatRatio(r.Ratio),
  },
];

const MAX_DISPLAY = 200;

// 조회조건 풀 — 거래처(마스터코드=CFL)·전기일 기간. 기존 SearchPanel 필드를 SearchFieldDef 로 이관.
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "sCardCode", label: "거래처", kind: "cfl", cflType: "Customer", placeholder: "거래처 선택" },
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

export default async function SalesByPartnerPage({
  searchParams,
}: {
  searchParams: Promise<{ sCardCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  const user = await getSession(); // 조건·컬럼 설정을 사용자별로 저장하기 위한 키

  let rows: CustomerSalesRow[] = [];
  let totalCount = 0;
  let totalAmount = 0;
  let error: string | null = null;

  try {
    // WHERE 동적 구성 (파라미터 바인딩). 기간은 항상 적용, 거래처는 미입력 시 절 생략.
    const where: string[] = [
      `i."CANCELED" = 'N'`,
      `TO_VARCHAR(i."DocDate",'YYYYMMDD') >= ?`,
      `TO_VARCHAR(i."DocDate",'YYYYMMDD') <= ?`,
    ];
    const params: (string | number)[] = [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")];
    if (sCardCode) {
      where.push(`i."CardCode" = ?`);
      params.push(sCardCode);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    // 그룹별 집계 + window SUM으로 전체합 동시 산출 -> 비중% 계산
    const all = await query<{
      CardCode: string;
      CardName: string;
      DocCount: string | number;
      SalesAmount: string | number;
      GrandTotal: string | number;
    }>(
      `SELECT TOP ${MAX_DISPLAY} i."CardCode", i."CardName",
              COUNT(*) AS "DocCount",
              SUM(TO_DECIMAL(i."DocTotal", 19, 2)) AS "SalesAmount",
              SUM(SUM(TO_DECIMAL(i."DocTotal", 19, 2))) OVER () AS "GrandTotal"
       FROM "OINV" i
       ${whereSql}
       GROUP BY i."CardCode", i."CardName"
       ORDER BY SUM(TO_DECIMAL(i."DocTotal", 19, 2)) DESC`,
      params,
    );

    const grandTotal = all.length > 0 ? Number(all[0].GrandTotal ?? 0) : 0;
    rows = all.map((r) => {
      const salesAmount = Number(r.SalesAmount ?? 0);
      return {
        CardCode: r.CardCode,
        CardName: r.CardName,
        DocCount: Number(r.DocCount ?? 0),
        SalesAmount: salesAmount,
        Ratio: grandTotal !== 0 ? (salesAmount / grandTotal) * 100 : 0,
      };
    });

    totalCount = rows.reduce((acc, r) => acc + Number(r.DocCount ?? 0), 0);
    totalAmount = rows.reduce((acc, r) => acc + Number(r.SalesAmount ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="거래처별 매출 분석"
        description="거래처별 매출 집계 리포트 (OINV 기준, GROUP BY 신규 설계)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sCardCode, searchFrom, searchTo }}
        storageKey={`b1w:search:sales-by-partner:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}개 거래처{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<CustomerSalesRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.CardCode}
            emptyText="조건에 맞는 매출 데이터가 없습니다."
            storageKey={`b1w:cols:sales-by-partner:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={2} className="text-right font-bold">
                      합계
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totalCount)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalAmount)}</TD>
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

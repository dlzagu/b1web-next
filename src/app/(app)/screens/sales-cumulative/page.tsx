/**
 * 매출 누계 추이 (GROUP BY 집계 + 누적합)
 * 데이터: OINV(AR송장 헤더, CANCELED='N') 월별 GROUP BY 집계 + SUM() OVER 누적합.
 * 차원=월+누적. 정렬=월 ASC(추이형). 컬럼: 매출월·전표건수·당월매출·누적매출.
 * (로컬 스펙 문서 uncertainties 참조 — 역설계 확정사항)
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type TrendRow = {
  YM: string;
  CNT: number;
  SUMTOTAL: number;
  CUMTOTAL: number;
};

function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
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

const COLUMNS: Column<TrendRow>[] = [
  { key: "YM", header: "매출월", align: "center", width: "120px" },
  { key: "CNT", header: "전표 건수", align: "right", width: "110px", render: (r) => formatNumber(r.CNT) },
  { key: "SUMTOTAL", header: "당월 매출", align: "right", width: "160px", render: (r) => formatMoney(r.SUMTOTAL) },
  { key: "CUMTOTAL", header: "누적 매출", align: "right", width: "160px", render: (r) => formatMoney(r.CUMTOTAL) },
];

// 조회조건 풀 — 기존 SearchPanel 필드를 SearchFieldDef 로 이관. 거래처 옵션은 동적(OCRD)이라 렌더 시 주입.
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "sCardCode", label: "거래처", kind: "select" },
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

export default async function SalesCumulativePage({
  searchParams,
}: {
  searchParams: Promise<{ sCardCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  const user = await getSession(); // 조건·컬럼 설정을 사용자별로 저장하기 위한 키

  // 거래처 select 옵션 — OCRD 영업 거래처만 (CardType='C' AND validFor='Y'), 목록 화면 패턴 그대로
  let customers: { CardCode: string; CardName: string }[] = [];
  let rows: TrendRow[] = [];
  let totalCnt = 0;
  let totalSum = 0;
  let error: string | null = null;

  try {
    customers = await query<{ CardCode: string; CardName: string }>(
      `SELECT "CardCode", "CardName" FROM "OCRD" WHERE "CardType"='C' AND "validFor"='Y' ORDER BY "CardCode"`,
    );

    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용, 거래처는 미입력 시 절 생략.
    // CANCELED='N'(확정분만) — rules.md 분석 리포트 화면 규칙
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

    const all = await query<TrendRow>(
      `SELECT "YM", "CNT", "SUMTOTAL",
              SUM("SUMTOTAL") OVER (ORDER BY "YM" ROWS UNBOUNDED PRECEDING) AS "CUMTOTAL"
       FROM (
         SELECT TO_VARCHAR(i."DocDate",'YYYY-MM') AS "YM",
                COUNT(*) AS "CNT",
                SUM(TO_DECIMAL(i."DocTotal")) AS "SUMTOTAL"
         FROM "OINV" i
         ${whereSql}
         GROUP BY TO_VARCHAR(i."DocDate",'YYYY-MM')
       ) t
       ORDER BY "YM"`,
      params,
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    totalCnt = rows.reduce((acc, r) => acc + Number(r.CNT ?? 0), 0);
    totalSum = rows.reduce((acc, r) => acc + Number(r.SUMTOTAL ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 거래처 select 옵션(동적 OCRD 목록)을 SEARCH_FIELDS 에 주입 — 기존 전체/거래처목록 그대로
  const searchFields: SearchFieldDef[] = SEARCH_FIELDS.map((f) =>
    f.name === "sCardCode"
      ? {
          ...f,
          options: [
            { value: "", label: "전체" },
            ...customers.map((c) => ({ value: c.CardCode, label: `${c.CardCode} ${c.CardName}` })),
          ],
        }
      : f,
  );

  return (
    <div>
      <PageHeader
        title="매출 누계 추이"
        description="OINV 월별 매출 GROUP BY 집계 + 누적합"
      />

      <SearchBar
        fields={searchFields}
        values={{ sCardCode, searchFrom, searchTo }}
        storageKey={`b1w:search:sales-cumulative:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{rows.length.toLocaleString()}개월</p>
          <DataGrid<TrendRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.YM}
            emptyText="조건에 맞는 매출 데이터가 없습니다."
            storageKey={`b1w:cols:sales-cumulative:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD className="text-right font-bold">기간 합계</TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(totalCnt)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalSum)}</TD>
                    <TD className="text-right font-bold tabular-nums">{formatMoney(totalSum)}</TD>
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

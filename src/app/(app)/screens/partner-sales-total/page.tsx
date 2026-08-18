/**
 * 거래처 매출 누계 (분석 리포트 재설계)
 *
 * ⚠️ 레거시 컨트롤러 불일치(로컬 스펙 문서 uncertainties 참조):
 * 원본 메뉴명은 '거래처 매출 누계'이지만 원본의 실제 구현은 전혀 다른 용도
 * (품목별 공급율 저장 관리화면 — 원본/데모 스키마 어디에도
 * 프로시저 미실재)라 원본 재현 자체가 불가능(dead menu). 문서목록 형태로 두는 대신
 * rules.md "분석 리포트 화면(집계형)" 룰에 따라 메뉴명 의도 기준으로 재설계함:
 * 차원=거래처(OINV.CardCode), GROUP BY 집계 리포트(전표건수·누적매출·비중%).
 * 매출원천=OINV(AR송장), CANCELED='N' 필수.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type CustomerSalesRow = {
  CardCode: string;
  CardName: string | null;
  DocCnt: number | string;
  SumDocTotal: number | string;
  Ratio: number | string;
};

function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString();
}

function formatPercent(v: number | string | null | undefined): string {
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
  { key: "CardCode", header: "거래처코드", width: "130px" },
  {
    key: "CardName",
    header: "거래처명",
    // 코드 단독 노출 방지 — OCRD 조인. 마스터 없으면 '-'.
    render: (r) => r.CardName ?? "-",
  },
  { key: "DocCnt", header: "전표건수", align: "right", width: "100px", render: (r) => formatNumber(r.DocCnt) },
  {
    key: "SumDocTotal",
    header: "누적매출",
    align: "right",
    width: "160px",
    render: (r) => formatMoney(r.SumDocTotal),
  },
  { key: "Ratio", header: "비중%", align: "right", width: "90px", render: (r) => formatPercent(r.Ratio) },
];

const MAX_DISPLAY = 200;

// 조회조건 풀 — 기존 SearchPanel 필드를 SearchFieldDef 로 이관. 마스터코드(거래처)는 kind:"cfl".
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "sCardCode", label: "거래처", kind: "cfl", cflType: "Customer", placeholder: "거래처 선택" },
  { name: "searchFrom", label: "전기일(시작)", kind: "date" },
  { name: "searchTo", label: "전기일(종료)", kind: "date" },
];

export default async function PartnerSalesTotalPage({
  searchParams,
}: {
  searchParams: Promise<{ sCardCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  const user = await getSession(); // 조회조건·컬럼 설정을 사용자별로 저장하기 위한 키

  let rows: CustomerSalesRow[] = [];
  let totalCnt = 0;
  let totalSum = 0;
  let error: string | null = null;

  try {
    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용, 거래처는 미입력 시 절 생략.
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

    // 그룹별 집계 + 비중%(window SUM 전체합 대비 각 그룹 측정값 비율)
    const all = await query<CustomerSalesRow>(
      `SELECT TOP ${MAX_DISPLAY} "CardCode", "CardName", "DocCnt", "SumDocTotal",
              CASE WHEN "GrandTotal" = 0 THEN 0 ELSE "SumDocTotal" / "GrandTotal" * 100 END AS "Ratio"
       FROM (
         SELECT i."CardCode" AS "CardCode", c."CardName" AS "CardName",
                COUNT(*) AS "DocCnt",
                SUM(TO_DECIMAL(i."DocTotal",19,4)) AS "SumDocTotal",
                SUM(SUM(TO_DECIMAL(i."DocTotal",19,4))) OVER () AS "GrandTotal"
         FROM "OINV" i
         LEFT JOIN "OCRD" c ON c."CardCode" = i."CardCode"
         ${whereSql}
         GROUP BY i."CardCode", c."CardName"
       )
       ORDER BY "SumDocTotal" DESC`,
      params,
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    totalCnt = rows.reduce((acc, r) => acc + Number(r.DocCnt ?? 0), 0);
    totalSum = rows.reduce((acc, r) => acc + Number(r.SumDocTotal ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="거래처 매출 누계"
        description="거래처 매출 누계 분석 — OINV 기반 GROUP BY 집계(레거시 컨트롤러 불일치로 메뉴명 기준 재설계, spec 참조)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sCardCode, searchFrom, searchTo }}
        storageKey={`b1w:search:partner-sales-total:${user?.uid ?? "anon"}`}
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
            emptyText="조건에 맞는 거래처 매출 내역이 없습니다."
            storageKey={`b1w:cols:partner-sales-total:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={2} className="text-right font-bold">
                      합계
                    </TD>
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

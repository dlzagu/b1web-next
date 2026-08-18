/**
 * W3030 — 수주 목록(구) (레퍼런스 정밀복제)
 * 데이터: OINV(AR송장 헤더) 직접 SELECT. 메뉴명은 '수주 목록(구)'이지만
 * 컨트롤러가 SLayer='Invoices'(Category='O')로 하드코딩되어 있어 실제 소스는 OINV.
 * (docs/conversion/specs/W3030.json uncertainties 참조 — 역설계 확정사항)
 * 패턴: orders/page.tsx 복제 (force-dynamic, 동적 WHERE 조립 + 파라미터 바인딩).
 */
import { PageHeader, SearchPanel, SearchField, CflField, DataGrid, type Column } from "@/components/erp";
import { Badge } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  NumAtCard: string | null;
  DocCur: string;
  SlpCode: number | null;
  SlpName: string | null;
  Comments: string | null;
  DocDate: string;
  DocDueDate: string;
  DocTotal: number;
  DocTotalFC: number;
  GroupNum: number | null;
  DocStatus: string;
  CANCELED: string;
};

function formatMoney(v: number | null | undefined): string {
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

const COLUMNS: Column<InvoiceRow>[] = [
  // 전표번호는 식별자 — 천단위 콤마 금지
  { key: "DocNum", header: "전표 번호", align: "right", width: "90px", render: (r) => String(r.DocNum ?? "") },
  { key: "CardCode", header: "고객", width: "110px" },
  { key: "CardName", header: "이름" },
  { key: "NumAtCard", header: "고객 참조 번호", width: "130px" },
  { key: "DocCur", header: "전표 통화", align: "center", width: "80px" },
  {
    key: "SlpName",
    header: "영업 사원",
    width: "120px",
    // 코드가 아니라 이름 표시(OSLP 조인). 미지정(-1)은 '-', 이름 없으면 코드 폴백.
    render: (r) => r.SlpName ?? (r.SlpCode != null && r.SlpCode !== -1 ? String(r.SlpCode) : "-"),
  },
  { key: "Comments", header: "비고" },
  { key: "DocDate", header: "전기일", align: "center", width: "110px", render: (r) => formatDate(r.DocDate) },
  { key: "DocDueDate", header: "만기일", align: "center", width: "110px", render: (r) => formatDate(r.DocDueDate) },
  { key: "DocTotal", header: "전표 총계", align: "right", width: "130px", render: (r) => formatMoney(r.DocTotal) },
  {
    key: "DocStatus",
    header: "상태",
    align: "center",
    width: "90px",
    render: (r) =>
      r.CANCELED === "Y" ? (
        <Badge variant="danger">취소됨</Badge>
      ) : r.DocStatus === "C" ? (
        <Badge variant="neutral">마감</Badge>
      ) : (
        <Badge variant="info">미결</Badge>
      ),
  },
];

const MAX_DISPLAY = 200;

export default async function W3030Page({
  searchParams,
}: {
  searchParams: Promise<{ sDocNum?: string; sCardCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sDocNum = sp.sDocNum?.trim() ?? "";
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  let rows: InvoiceRow[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용, 나머지는 미입력 시 절 생략.
    const where: string[] = [`TO_VARCHAR(i."DocDate",'YYYYMMDD') >= ?`, `TO_VARCHAR(i."DocDate",'YYYYMMDD') <= ?`];
    const params: (string | number)[] = [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")];
    if (sDocNum) {
      const n = Number(sDocNum);
      if (Number.isFinite(n)) {
        where.push(`i."DocNum" = ?`);
        params.push(n);
      }
    }
    if (sCardCode) {
      where.push(`i."CardCode" = ?`);
      params.push(sCardCode);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const all = await query<InvoiceRow>(
      `SELECT TOP ${MAX_DISPLAY} i."DocEntry", i."DocNum", i."CardCode", i."CardName", i."NumAtCard", i."DocCur",
              i."SlpCode", s."SlpName", i."Comments",
              TO_VARCHAR(i."DocDate",'YYYY-MM-DD') AS "DocDate", TO_VARCHAR(i."DocDueDate",'YYYY-MM-DD') AS "DocDueDate",
              i."DocTotal", i."DocTotalFC", i."GroupNum", i."DocStatus", i."CANCELED"
       FROM "OINV" i
       LEFT JOIN "OSLP" s ON s."SlpCode" = i."SlpCode"
       ${whereSql}
       ORDER BY i."DocEntry" DESC`,
      params,
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    total = rows.reduce((acc, r) => acc + Number(r.DocTotal ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="수주 목록(구)" description="W3030 · 레퍼런스 정밀복제 — OINV 기반(레거시 실동작)" />

      <SearchPanel>
        <SearchField label="문서번호" name="sDocNum" defaultValue={sDocNum} placeholder="문서번호" />
        <CflField label="거래처" name="sCardCode" cflType="Customer" defaultValue={sCardCode} placeholder="거래처 선택" />
        <SearchField label="전기일(시작)" name="searchFrom" type="date" defaultValue={searchFrom} />
        <SearchField label="전기일(종료)" name="searchTo" type="date" defaultValue={searchTo} />
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
          <DataGrid<InvoiceRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocEntry}
            rowHref={(r) => `/screens/W3030/${r.DocEntry}`}
            emptyText="조건에 맞는 판매오더가 없습니다."
            footer={
              <div className="mt-2 flex justify-end gap-3 rounded-card bg-surface-2 px-4 py-2.5 text-sm">
                <span className="text-muted">전표 총계 합계</span>
                <span className="font-bold tabular-nums">{formatMoney(total)}</span>
              </div>
            }
          />
        </>
      )}
    </div>
  );
}

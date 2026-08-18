/**
 * 창고 이전 요청 (레퍼런스 정밀복제)
 * 데이터: OWTQ(재고이전요청 헤더) 직접 SELECT. 컨트롤러가 SLayer='InventoryTransferRequests'
 * (Category='A')로 하드코딩되어 있고 메뉴명·실제 데이터소스가 일치(OWTQ).
 * (로컬 스펙 문서 uncertainties 참조 — 역설계 확정사항)
 * 패턴: 조회 목록 화면 복제 (force-dynamic, 동적 WHERE 조립 + 파라미터 바인딩).
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { Badge } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type TransferRequestRow = {
  DocEntry: number;
  DocNum: number;
  CardCode: string | null;
  CardName: string | null;
  SlpCode: number | null;
  SlpName: string | null;
  Comments: string | null;
  DocDate: string;
  WhsCode: string | null;
  FromWhsName: string | null;
  ToWhsCode: string | null;
  ToWhsName: string | null;
  Address: string | null;
  DocStatus: string;
  CANCELED: string;
};

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

// 코드 → 이름(마스터 조인 결과) 렌더. 이름 없으면 코드 폴백, 코드도 없으면 '-'.
function renderNamed(code: string | number | null | undefined, name: string | null | undefined): string {
  if (name) return name;
  if (code !== null && code !== undefined && code !== -1 && code !== "") return String(code);
  return "-";
}

const COLUMNS: Column<TransferRequestRow>[] = [
  // 전표번호는 식별자 — 천단위 콤마 금지
  { key: "DocNum", header: "전표 번호", align: "right", width: "90px", render: (r) => String(r.DocNum ?? "") },
  { key: "CardCode", header: "거래처 코드", width: "110px", render: (r) => r.CardCode || "-" },
  { key: "CardName", header: "거래처 이름", render: (r) => r.CardName || "-" },
  {
    key: "SlpName",
    header: "영업 사원",
    width: "110px",
    render: (r) => renderNamed(r.SlpCode, r.SlpName),
  },
  { key: "Comments", header: "비고" },
  { key: "DocDate", header: "전기일", align: "center", width: "110px", render: (r) => formatDate(r.DocDate) },
  {
    key: "FromWhsName",
    header: "출고 창고",
    width: "150px",
    render: (r) => renderNamed(r.WhsCode, r.FromWhsName),
  },
  {
    key: "ToWhsName",
    header: "입고 창고",
    width: "150px",
    render: (r) => renderNamed(r.ToWhsCode, r.ToWhsName),
  },
  { key: "Address", header: "청구처", render: (r) => r.Address || "-" },
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

export default async function TransferRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ sDocNum?: string; sCardCode?: string; searchFrom?: string; searchTo?: string }>;
}) {
  const sp = await searchParams;
  const sDocNum = sp.sDocNum?.trim() ?? "";
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();

  const user = await getSession(); // 조건·컬럼 설정을 사용자별로 저장하기 위한 키

  // 거래처 select 옵션 — OCRD 영업 거래처만 (CardType='C' AND validFor='Y', 목록 화면과 동일 가정)
  let customers: { CardCode: string; CardName: string }[] = [];
  let rows: TransferRequestRow[] = [];
  let error: string | null = null;

  try {
    customers = await query<{ CardCode: string; CardName: string }>(
      `SELECT "CardCode", "CardName" FROM "OCRD" WHERE "CardType"='C' AND "validFor"='Y' ORDER BY "CardCode"`,
    );

    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 기간은 항상 적용, 나머지는 미입력 시 절 생략.
    const where: string[] = [`TO_VARCHAR(q."DocDate",'YYYYMMDD') >= ?`, `TO_VARCHAR(q."DocDate",'YYYYMMDD') <= ?`];
    const params: (string | number)[] = [searchFrom.replace(/-/g, ""), searchTo.replace(/-/g, "")];
    if (sDocNum) {
      const n = Number(sDocNum);
      if (Number.isFinite(n)) {
        where.push(`q."DocNum" = ?`);
        params.push(n);
      }
    }
    if (sCardCode) {
      where.push(`q."CardCode" = ?`);
      params.push(sCardCode);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    rows = await query<TransferRequestRow>(
      `SELECT TOP ${MAX_DISPLAY} q."DocEntry", q."DocNum", q."CardCode", q."CardName",
              q."SlpCode", s."SlpName", q."Comments",
              TO_VARCHAR(q."DocDate",'YYYY-MM-DD') AS "DocDate",
              q."Filler" AS "WhsCode", wf."WhsName" AS "FromWhsName",
              q."ToWhsCode", wt."WhsName" AS "ToWhsName",
              q."Address", q."DocStatus", q."CANCELED"
       FROM "OWTQ" q
       LEFT JOIN "OSLP" s ON s."SlpCode" = q."SlpCode"
       LEFT JOIN "OWHS" wf ON wf."WhsCode" = q."Filler"
       LEFT JOIN "OWHS" wt ON wt."WhsCode" = q."ToWhsCode"
       ${whereSql}
       ORDER BY q."DocEntry" DESC`,
      params,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 조회조건 풀 — 기존 SearchField 를 SearchFieldDef 로 이관. 거래처 옵션은 런타임 조회(customers) 의존이라 컴포넌트 내부 구성.
  const SEARCH_FIELDS: SearchFieldDef[] = [
    { name: "sDocNum", label: "문서번호", kind: "text", placeholder: "문서번호" },
    {
      name: "sCardCode",
      label: "거래처",
      kind: "select",
      options: [
        { value: "", label: "전체" },
        ...customers.map((c) => ({ value: c.CardCode, label: `${c.CardCode} ${c.CardName}` })),
      ],
    },
    { name: "searchFrom", label: "전기일(시작)", kind: "date" },
    { name: "searchTo", label: "전기일(종료)", kind: "date" },
  ];

  return (
    <div>
      <PageHeader title="창고 이전 요청" description="레퍼런스 정밀복제 — OWTQ 기반(레거시 실동작)" />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sDocNum, sCardCode, searchFrom, searchTo }}
        storageKey={`b1w:search:transfer-requests:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}건{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<TransferRequestRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.DocEntry}
            rowHref={(r) => `/screens/transfer-requests/${r.DocEntry}`}
            emptyText="조건에 맞는 재고이전요청이 없습니다."
            storageKey={`b1w:cols:transfer-requests:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

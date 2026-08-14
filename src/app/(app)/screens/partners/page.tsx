/**
 * 거래처 현황 — 조회 템플릿 복제 3호 (마스터형, 직접 SELECT).
 * 품목현황(items) 패턴 복제 — 조회 템플릿이 마스터에도 그대로 적용됨을 증명.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type PartnerRow = {
  CardCode: string;
  CardName: string;
  CardType: string;
  GroupName: string | null;
  Phone1: string | null;
  Balance: number;
  validFor: string;
};

const TYPE_LABEL: Record<string, string> = { C: "고객", S: "공급처", L: "리드" };

const COLUMNS: Column<PartnerRow>[] = [
  { key: "CardCode", header: "코드", width: "140px" },
  { key: "CardName", header: "거래처명" },
  { key: "CardType", header: "유형", align: "center", width: "70px", render: (r) => TYPE_LABEL[r.CardType] ?? r.CardType },
  { key: "GroupName", header: "그룹", width: "160px" },
  { key: "Phone1", header: "전화", width: "130px" },
  { key: "Balance", header: "잔액", align: "right", render: (r) => Math.round(r.Balance).toLocaleString() },
  { key: "validFor", header: "활성", align: "center", width: "60px", render: (r) => (r.validFor === "Y" ? "○" : "—") },
];

const MAX_DISPLAY = 500;

// 조회조건 풀 — 기존 SearchPanel 필드를 SearchFieldDef 로 이전 (전부 기본표시).
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "code", label: "코드", kind: "text", placeholder: "코드 시작 문자" },
  { name: "name", label: "거래처명", kind: "text", placeholder: "거래처명 포함" },
  {
    name: "type",
    label: "유형",
    kind: "select",
    options: [
      { value: "C", label: "고객" },
      { value: "S", label: "공급처" },
      { value: "L", label: "리드" },
      { value: "A", label: "전체" },
    ],
  },
];

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.code?.trim() ?? "";
  const name = sp.name?.trim() ?? "";
  const type = sp.type ?? "C"; // 기본 고객

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (code) {
    where.push(`c."CardCode" LIKE ?`);
    params.push(code + "%");
  }
  if (name) {
    where.push(`c."CardName" LIKE ?`);
    params.push("%" + name + "%");
  }
  if (type === "C" || type === "S" || type === "L") {
    where.push(`c."CardType" = ?`);
    params.push(type);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  let rows: PartnerRow[] = [];
  let error: string | null = null;
  try {
    const all = await query<PartnerRow>(
      `SELECT c."CardCode", c."CardName", c."CardType", g."GroupName", c."Phone1", c."Balance", c."validFor"
       FROM OCRD c LEFT JOIN OCRG g ON c."GroupCode" = g."GroupCode"
       ${whereSql}
       ORDER BY c."CardCode"`,
      params,
    );
    rows = all.slice(0, MAX_DISPLAY);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="거래처 현황" description="OCRD · 표준테이블 직접 조회 (조회 템플릿 복제 3호)" />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ code, name, type }}
        storageKey={`b1w:search:partners:${user?.uid ?? "anon"}`}
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
          <DataGrid<PartnerRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.CardCode}
            rowHref={(r) => `/screens/partners/${encodeURIComponent(r.CardCode)}`}
            emptyText="조건에 맞는 거래처가 없습니다."
            storageKey={`b1w:cols:partners:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

/**
 * 품목 현황 — 조회 템플릿 복제 2호 (직접 테이블 SELECT 패턴)
 * 프로시저 경유 화면과 달리 표준테이블(OITM+OITB) 직접 조회 경로를 증명.
 *   해석 → 테넌트 web-admin 스키마 부재로 블록(open_item). 템플릿 복제 검증은 이 화면으로 대체.
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type ItemRow = {
  ItemCode: string;
  ItemName: string;
  ItmsGrpCod: number;
  ItmsGrpNam: string | null;
  OnHand: number;
  validFor: string;
};

const COLUMNS: Column<ItemRow>[] = [
  { key: "ItemCode", header: "품목코드", width: "150px" },
  { key: "ItemName", header: "품목명" },
  { key: "ItmsGrpNam", header: "품목그룹", width: "160px" },
  { key: "OnHand", header: "총재고", align: "right" },
  { key: "validFor", header: "활성", align: "center", width: "60px", render: (r) => (r.validFor === "Y" ? "○" : "—") },
];

// 조회조건 풀 — 기존 검색필드를 SearchFieldDef 로 옮김.
const SEARCH_FIELDS: SearchFieldDef[] = [
  { name: "code", label: "품목코드", kind: "text", placeholder: "코드 시작 문자" },
  { name: "name", label: "품목명", kind: "text", placeholder: "품목명 포함" },
  {
    name: "active",
    label: "활성",
    kind: "select",
    options: [
      { value: "Y", label: "활성만" },
      { value: "A", label: "전체" },
    ],
  },
];

const MAX_DISPLAY = 500;

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string; active?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.code?.trim() ?? "";
  const name = sp.name?.trim() ?? "";
  const active = sp.active ?? "Y"; // 기본 활성만
  const user = await getSession();

  // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전)
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (code) {
    where.push(`i."ItemCode" LIKE ?`);
    params.push(code + "%");
  }
  if (name) {
    where.push(`i."ItemName" LIKE ?`);
    params.push("%" + name + "%");
  }
  if (active === "Y") where.push(`i."validFor" = 'Y'`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  let rows: ItemRow[] = [];
  let error: string | null = null;
  try {
    const all = await query<ItemRow>(
      `SELECT i."ItemCode", i."ItemName", i."ItmsGrpCod", g."ItmsGrpNam", i."OnHand", i."validFor"
       FROM OITM i LEFT JOIN OITB g ON i."ItmsGrpCod" = g."ItmsGrpCod"
       ${whereSql}
       ORDER BY i."ItemCode"`,
      params,
    );
    rows = all.slice(0, MAX_DISPLAY);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="품목 현황" description="OITM · 표준테이블 직접 조회 (조회 템플릿 복제 2호)" />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ code, name, active }}
        storageKey={`b1w:search:items:${user?.uid ?? "anon"}`}
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
          <DataGrid<ItemRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.ItemCode}
            rowHref={(r) => `/screens/items/${encodeURIComponent(r.ItemCode)}`}
            emptyText="조건에 맞는 품목이 없습니다."
            storageKey={`b1w:cols:items:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

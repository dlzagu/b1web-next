/**
 * W3120 — BP 마스터 조회 (레퍼런스 정밀복제)
 * 데이터: OCRD(비즈니스 파트너 마스터) 직접 SELECT.
 * ⚠️ 레거시 소스(레거시 원본)에 'W3120' 컨트롤러/JSP가 전혀 존재하지 않아
 * 원본의 메뉴·화면 메타 설정만으로 역설계함.
 * 대상 테이블(OCRD 비즈니스 파트너)은 메뉴명과 의미상 일치하나
 * W3030처럼 컨트롤러 SLayer 하드코딩으로 확정하지 못한 추정 단계.
 * (docs/conversion/specs/W3120.json uncertainties 참조)
 * 패턴: W3030/page.tsx 복제 (force-dynamic, 동적 WHERE 조립 + 파라미터 바인딩).
 */
import { PageHeader, SearchPanel, SearchField, DataGrid, type Column } from "@/components/erp";
import { Badge } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type BpRow = {
  CardCode: string;
  CardName: string;
  CardType: string;
  GroupCode: number | null;
  GroupName: string | null;
  Currency: string | null;
  Phone1: string | null;
  Address: string | null;
  SlpCode: number | null;
  SlpName: string | null;
  validFor: string;
};

const CARD_TYPE_LABEL: Record<string, string> = {
  C: "고객",
  S: "공급업체",
  L: "리드",
};

const MAX_DISPLAY = 200;

const COLUMNS: Column<BpRow>[] = [
  { key: "CardCode", header: "BP 코드", width: "130px" },
  { key: "CardName", header: "BP 이름" },
  {
    key: "CardType",
    header: "BP 유형",
    align: "center",
    width: "90px",
    render: (r) => (
      <Badge variant={r.CardType === "C" ? "info" : r.CardType === "S" ? "warning" : "neutral"}>
        {CARD_TYPE_LABEL[r.CardType] ?? r.CardType}
      </Badge>
    ),
  },
  {
    key: "GroupName",
    header: "그룹",
    width: "150px",
    // 코드가 아니라 이름 표시(OCRG 조인). 미지정은 '-', 이름 없으면 코드 폴백.
    render: (r) => r.GroupName ?? (r.GroupCode != null ? String(r.GroupCode) : "-"),
  },
  { key: "Currency", header: "BP 통화", align: "center", width: "80px" },
  { key: "Phone1", header: "전화번호", width: "130px" },
  { key: "Address", header: "청구처 주소" },
  {
    key: "SlpName",
    header: "영업 사원",
    width: "110px",
    // 코드가 아니라 이름 표시(OSLP 조인). 미지정(-1)은 '-', 이름 없으면 코드 폴백.
    render: (r) => r.SlpName ?? (r.SlpCode != null && r.SlpCode !== -1 ? String(r.SlpCode) : "-"),
  },
  {
    key: "validFor",
    header: "활성",
    align: "center",
    width: "80px",
    render: (r) =>
      r.validFor === "Y" ? <Badge variant="success">활성</Badge> : <Badge variant="neutral">비활성</Badge>,
  },
];

export default async function W3120Page({
  searchParams,
}: {
  searchParams: Promise<{ sCardCode?: string; sCardType?: string; sGroupCode?: string }>;
}) {
  const sp = await searchParams;
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const sCardType = sp.sCardType?.trim() ?? "";
  const sGroupCode = sp.sGroupCode?.trim() ?? "";

  let groups: { GroupCode: number; GroupName: string }[] = [];
  let rows: BpRow[] = [];
  let error: string | null = null;

  try {
    groups = await query<{ GroupCode: number; GroupName: string }>(
      `SELECT "GroupCode", "GroupName" FROM "OCRG" ORDER BY "GroupCode"`,
    );

    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 미입력 조건은 절 생략.
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (sCardCode) {
      where.push(`c."CardCode" = ?`);
      params.push(sCardCode);
    }
    if (sCardType) {
      where.push(`c."CardType" = ?`);
      params.push(sCardType);
    }
    if (sGroupCode) {
      const n = Number(sGroupCode);
      if (Number.isFinite(n)) {
        where.push(`c."GroupCode" = ?`);
        params.push(n);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    rows = await query<BpRow>(
      `SELECT TOP ${MAX_DISPLAY} c."CardCode", c."CardName", c."CardType", c."GroupCode", g."GroupName",
              c."Currency", c."Phone1", c."Address", c."SlpCode", s."SlpName", c."validFor"
       FROM "OCRD" c
       LEFT JOIN "OCRG" g ON g."GroupCode" = c."GroupCode"
       LEFT JOIN "OSLP" s ON s."SlpCode" = c."SlpCode"
       ${whereSql}
       ORDER BY c."CardCode"`,
      params,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="BP 마스터 조회"
        description="W3120 · 레퍼런스 정밀복제 — OCRD 기반(레거시 추정, uncertainties 참조)"
      />

      <SearchPanel>
        <SearchField label="BP 코드" name="sCardCode" defaultValue={sCardCode} placeholder="BP 코드" />
        <SearchField
          label="BP 유형"
          name="sCardType"
          type="select"
          defaultValue={sCardType}
          options={[
            { value: "", label: "전체" },
            { value: "C", label: "고객" },
            { value: "S", label: "공급업체" },
          ]}
        />
        <SearchField
          label="그룹"
          name="sGroupCode"
          type="select"
          defaultValue={sGroupCode}
          options={[
            { value: "", label: "전체" },
            ...groups.map((g) => ({ value: String(g.GroupCode), label: `${g.GroupCode} ${g.GroupName}` })),
          ]}
        />
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
          <DataGrid<BpRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.CardCode}
            emptyText="조건에 맞는 BP가 없습니다."
          />
        </>
      )}
    </div>
  );
}

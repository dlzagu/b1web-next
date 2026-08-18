/**
 * 품목 마스터(구) (레퍼런스 정밀복제)
 * 데이터: OITM(품목 마스터) 직접 SELECT. 원본에 메뉴만 있고
 * 실제 구현이 원본에 전혀 없음(미구현 메뉴 추정) —
 * 메뉴명을 근거로 표준 품목 마스터(구)를 재구성. 그리드 컬럼은
 * 원본의 화면 메타 설정에서 목록 노출 컬럼 11개를 채택.
 * (로컬 스펙 문서 uncertainties 참조 — 역설계 확정사항)
 * 패턴: 조회 목록 화면 복제 (force-dynamic, 동적 WHERE 조립 + 파라미터 바인딩).
 */
import { PageHeader, SearchPanel, SearchField, DataGrid, type Column } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type ItemRow = {
  ItemCode: string;
  ItemName: string | null;
  FrgnName: string | null;
  ItmsGrpCod: number | null;
  ItmsGrpNam: string | null;
  PrchseItem: string;
  SellItem: string;
  InvntItem: string;
  OnHand: number;
  CodeBars: string | null;
  OnOrder: number;
  CardCode: string | null;
  CardName: string | null;
  validFor: string;
};

function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function yn(v: string | null | undefined): string {
  return v === "Y" ? "Y" : v === "N" ? "N" : "-";
}

const COLUMNS: Column<ItemRow>[] = [
  { key: "ItemCode", header: "품목 번호", width: "120px" },
  { key: "ItemName", header: "품목 내역" },
  { key: "FrgnName", header: "외국어 이름", width: "160px" },
  {
    key: "ItmsGrpNam",
    header: "품목 그룹",
    width: "110px",
    // 코드가 아니라 그룹명 표시(OITB 조인). 미지정은 '-', 이름 없으면 코드 폴백.
    render: (r) => r.ItmsGrpNam ?? (r.ItmsGrpCod != null ? String(r.ItmsGrpCod) : "-"),
  },
  { key: "PrchseItem", header: "구매 품목", align: "center", width: "80px", render: (r) => yn(r.PrchseItem) },
  { key: "SellItem", header: "판매 품목", align: "center", width: "80px", render: (r) => yn(r.SellItem) },
  { key: "InvntItem", header: "재고 품목", align: "center", width: "80px", render: (r) => yn(r.InvntItem) },
  { key: "OnHand", header: "재고", align: "right", width: "100px", render: (r) => formatNumber(r.OnHand) },
  { key: "CodeBars", header: "바코드", width: "130px" },
  { key: "OnOrder", header: "발주 진행 수량", align: "right", width: "110px", render: (r) => formatNumber(r.OnOrder) },
  {
    key: "CardName",
    header: "선호 공급업체",
    width: "160px",
    // 코드가 아니라 거래처명 표시(OCRD 조인). 미지정은 '-', 이름 없으면 코드 폴백.
    render: (r) => r.CardName ?? (r.CardCode ? r.CardCode : "-"),
  },
];

const MAX_DISPLAY = 200;

export default async function ItemMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ sItemCode?: string; sItemName?: string; sItmsGrpCod?: string; sValidFor?: string }>;
}) {
  const sp = await searchParams;
  const sItemCode = sp.sItemCode?.trim() ?? "";
  const sItemName = sp.sItemName?.trim() ?? "";
  const sItmsGrpCod = sp.sItmsGrpCod?.trim() ?? "";
  const sValidFor = sp.sValidFor?.trim() ?? "";

  // 품목그룹 select 옵션 — OITB 전체
  let groups: { ItmsGrpCod: number; ItmsGrpNam: string }[] = [];
  let rows: ItemRow[] = [];
  let sumOnHand = 0;
  let sumOnOrder = 0;
  let error: string | null = null;

  try {
    groups = await query<{ ItmsGrpCod: number; ItmsGrpNam: string }>(
      `SELECT "ItmsGrpCod", "ItmsGrpNam" FROM "OITB" ORDER BY "ItmsGrpCod"`,
    );

    // WHERE 동적 구성 (파라미터 바인딩 — 인젝션 안전). 미입력 조건은 절 생략(전체 조회).
    const where: string[] = ["1=1"];
    const params: (string | number)[] = [];
    if (sItemCode) {
      where.push(`A."ItemCode" LIKE ?`);
      params.push(`%${sItemCode}%`);
    }
    if (sItemName) {
      where.push(`A."ItemName" LIKE ?`);
      params.push(`%${sItemName}%`);
    }
    if (sItmsGrpCod) {
      where.push(`TO_VARCHAR(A."ItmsGrpCod") = ?`);
      params.push(sItmsGrpCod);
    }
    if (sValidFor) {
      where.push(`A."validFor" = ?`);
      params.push(sValidFor);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const all = await query<ItemRow>(
      `SELECT TOP ${MAX_DISPLAY} A."ItemCode", A."ItemName", A."FrgnName", A."ItmsGrpCod", B."ItmsGrpNam",
              A."PrchseItem", A."SellItem", A."InvntItem", A."OnHand", A."CodeBars", A."OnOrder",
              A."CardCode", C."CardName", A."validFor"
       FROM "OITM" A
       LEFT JOIN "OITB" B ON B."ItmsGrpCod" = A."ItmsGrpCod"
       LEFT JOIN "OCRD" C ON C."CardCode" = A."CardCode"
       ${whereSql}
       ORDER BY A."ItemCode"`,
      params,
    );
    rows = all;
    // HANA DECIMAL은 문자열로 반환되므로 합계 계산 전 Number() 강제 변환 필수
    sumOnHand = rows.reduce((acc, r) => acc + Number(r.OnHand ?? 0), 0);
    sumOnOrder = rows.reduce((acc, r) => acc + Number(r.OnOrder ?? 0), 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="품목 마스터(구)" description="레퍼런스 정밀복제 — OITM 기반(레거시 미구현 메뉴, 표준 재구성)" />

      <SearchPanel>
        <SearchField label="품목코드" name="sItemCode" defaultValue={sItemCode} placeholder="품목코드" />
        <SearchField label="품목명" name="sItemName" defaultValue={sItemName} placeholder="품목명" />
        <SearchField
          label="품목그룹"
          name="sItmsGrpCod"
          type="select"
          defaultValue={sItmsGrpCod}
          options={[
            { value: "", label: "전체" },
            ...groups.map((g) => ({ value: String(g.ItmsGrpCod), label: g.ItmsGrpNam })),
          ]}
        />
        <SearchField
          label="활성여부"
          name="sValidFor"
          type="select"
          defaultValue={sValidFor}
          options={[
            { value: "", label: "전체" },
            { value: "Y", label: "활성" },
            { value: "N", label: "비활성" },
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
          <DataGrid<ItemRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.ItemCode}
            emptyText="조건에 맞는 품목이 없습니다."
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={7} className="text-right font-bold">
                      재고/발주 합계
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatNumber(sumOnHand)}</TD>
                    <TD />
                    <TD className="text-right font-bold tabular-nums">{formatNumber(sumOnOrder)}</TD>
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

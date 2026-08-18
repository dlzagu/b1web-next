/**
 * 품목별 재고 분포 — 행=품목, 열=창고 피벗. "이 품목이 어느 창고에 얼마나 있나"를 한 줄로 본다.
 * '창고 재고 조회'(행=창고×품목, 약정·발주잔량까지)와 축이 반대인 화면 — 지표는 재고수량 1종만
 * 유지해 두 화면의 경계를 지킨다. 날짜 조건 없음(현재 시점 스냅샷 전용).
 *
 * 데이터: OITW(품목-창고 재고) + OITM(품명) + OITB(품목그룹) + OWHS(창고 열 목록).
 * 창고 열은 런타임에 OWHS 에서 생성 — 창고코드를 키로 매핑한다(위치 대응 아님: 열 순서가
 * 바뀌어도 값이 다른 창고 칸에 찍힐 수 없다). 0 은 빈칸으로 표시해 분포가 눈에 들어오게 한다.
 * 패턴: 재고 입출고 대장(동적 컬럼 + frozen/total) 복제.
 */
import {
  PageHeader,
  SearchBar,
  DataGrid,
  type Column,
  type SearchFieldDef,
} from "@/components/erp";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const MAX_DISPLAY = 500;

function fmtQty(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return ""; // 0 은 빈칸 — 피벗에서 분포를 읽기 쉽게
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default async function StockByItemPage({
  searchParams,
}: {
  searchParams: Promise<{ sItemGrp?: string; sItemCd?: string }>;
}) {
  const sp = await searchParams;
  const user = await getSession();
  const sItemGrp = sp.sItemGrp?.trim() ?? "";
  const sItemCd = sp.sItemCd?.trim() ?? "";

  let warehouses: { WhsCode: string; WhsName: string }[] = [];
  let groups: { ItmsGrpCod: number; ItmsGrpNam: string }[] = [];
  let rows: Row[] = [];
  let error: string | null = null;

  try {
    [warehouses, groups] = await Promise.all([
      query<{ WhsCode: string; WhsName: string }>(
        `SELECT "WhsCode", "WhsName" FROM "OWHS" WHERE "Inactive" = 'N' ORDER BY "WhsCode"`,
      ),
      query<{ ItmsGrpCod: number; ItmsGrpNam: string }>(
        `SELECT "ItmsGrpCod", "ItmsGrpNam" FROM "OITB" ORDER BY "ItmsGrpNam"`,
      ),
    ]);

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (sItemGrp) {
      where.push(`i."ItmsGrpCod" = ?`);
      params.push(Number(sItemGrp));
    }
    if (sItemCd) {
      where.push(`i."ItemCode" = ?`);
      params.push(sItemCd);
    }

    const raw = await query<{
      ItemCode: string;
      ItemName: string;
      ItmsGrpNam: string;
      WhsCode: string;
      OnHand: number | string;
    }>(
      `SELECT w."ItemCode", i."ItemName", COALESCE(g."ItmsGrpNam", '') AS "ItmsGrpNam",
              w."WhsCode", w."OnHand"
       FROM "OITW" w
       JOIN "OITM" i ON i."ItemCode" = w."ItemCode"
       LEFT JOIN "OITB" g ON g."ItmsGrpCod" = i."ItmsGrpCod"
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY "ItmsGrpNam", w."ItemCode", w."WhsCode"`,
      params,
    );

    // 피벗 — 창고코드를 키로 접는다 (행: 품목 1건, 열: whs_<코드> + 합계)
    const byItem = new Map<string, Row>();
    for (const r of raw) {
      let row = byItem.get(r.ItemCode);
      if (!row) {
        row = { ItemCode: r.ItemCode, ItemName: r.ItemName, ItmsGrpNam: r.ItmsGrpNam, Total: 0 };
        byItem.set(r.ItemCode, row);
      }
      const qty = Number(r.OnHand ?? 0);
      row[`whs_${r.WhsCode}`] = qty;
      row.Total = Number(row.Total ?? 0) + qty;
    }
    rows = [...byItem.values()].slice(0, MAX_DISPLAY);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const SEARCH_FIELDS: SearchFieldDef[] = [
    {
      name: "sItemGrp",
      label: "품목그룹",
      kind: "select",
      options: [
        { value: "", label: "전체" },
        ...groups.map((g) => ({ value: String(g.ItmsGrpCod), label: g.ItmsGrpNam })),
      ],
    },
    { name: "sItemCd", label: "품목", kind: "cfl", cflType: "Item" },
  ];

  const columns: Column<Row>[] = [
    { key: "ItemCode", header: "품목코드", width: "130px", frozen: true, totalLabel: "합계" },
    { key: "ItemName", header: "품명", width: "220px", frozen: true },
    { key: "ItmsGrpNam", header: "품목그룹", width: "130px", defaultHidden: true },
    ...warehouses.map(
      (w): Column<Row> => ({
        key: `whs_${w.WhsCode}`,
        header: w.WhsName,
        align: "right",
        width: "130px",
        total: "sum",
        render: (r) => fmtQty(r[`whs_${w.WhsCode}`]),
      }),
    ),
    {
      key: "Total",
      header: "전체 재고",
      align: "right",
      width: "130px",
      total: "sum",
      render: (r) => {
        const n = Number(r.Total ?? 0);
        return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "";
      },
    },
  ];

  return (
    <div>
      <PageHeader title="품목별 재고 분포" description="OITW 피벗 — 행=품목, 열=창고 (현재 시점)" />
      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sItemGrp, sItemCd }}
        storageKey={`b1w:search:stock-by-item:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}개 품목
            {rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
            <span className="ml-2 text-xs text-faint">
              현재 시점 스냅샷 · 수량 0 은 빈칸 · 창고별 상세(약정·발주잔량)는 창고 재고 조회에서
            </span>
          </p>
          <DataGrid<Row>
            columns={columns}
            rows={rows}
            getRowKey={(r) => String(r.ItemCode)}
            rowHref={(r) => `/screens/items/${encodeURIComponent(String(r.ItemCode))}`}
            emptyText="조건에 맞는 품목이 없습니다."
            storageKey={`b1w:cols:stock-by-item:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

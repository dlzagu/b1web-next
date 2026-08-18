/**
 * 매출 피벗 분석 — 행=거래처 또는 품목(탭 전환), 열=월, 값=매출액(GTotal, VAT 포함).
 * "누가/무엇이 어느 달에 팔렸나"를 한 표로 본다 — 단일축 매출 분석 화면들의 교차축 버전.
 *
 * 측정값은 두 탭 모두 **INV1 라인 GTotal(VAT 포함)** 로 통일한다 — 엔진이
 * DocTotal = Σ(LineTotal+라인VAT) 로 만들므로 라인 합 = 헤더 합이 손실 없이 성립하고,
 * 두 탭의 총합이 서로 같고 월별 매출 추이(DocTotal 기준)와도 일치한다.
 * (공급가 기준 화면은 품목별 매출 분석(LineTotal)이 담당 — 화면 간 합 차이는 VAT 다.)
 * 패턴: 재고 입출고 대장 복제 — monthBuckets·동적 버킷 SELECT·TabNav·frozen/total.
 */
import {
  PageHeader,
  SearchBar,
  DataGrid,
  TabNav,
  type Column,
  type SearchFieldDef,
  type TabNavItem,
} from "@/components/erp";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Bucket = { key: string; label: string; from: string; to: string };

const MAX_DISPLAY = 200;

function fmtAmt(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return ""; // 0 은 빈칸 — 분포 가독성
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
/** 1월~종료월 고정 버킷 — 실데이터에서 월을 뽑으면 매출 없는 달이 열에서 사라진다 */
function monthBuckets(year: number, endMonth: number): Bucket[] {
  const out: Bucket[] = [];
  for (let m = 1; m <= endMonth; m += 1) {
    out.push({
      key: `m${m}`,
      label: `${m}월`,
      from: `${year}-${pad2(m)}-01`,
      to: `${year}-${pad2(m)}-${pad2(lastDayOf(year, m))}`,
    });
  }
  return out;
}

export default async function SalesPivotPage({
  searchParams,
}: {
  searchParams: Promise<{
    sYear?: string;
    sMonth?: string;
    sCardCode?: string;
    sItemGrp?: string;
    sItemCd?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await getSession();
  const tab = sp.tab === "item" ? "item" : "partner";
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const sItemGrp = sp.sItemGrp?.trim() ?? "";
  const sItemCd = sp.sItemCd?.trim() ?? "";

  const now = new Date();
  let years: number[] = [now.getFullYear()];
  let groups: { ItmsGrpCod: number; ItmsGrpNam: string }[] = [];
  let rows: Row[] = [];
  let buckets: Bucket[] = [];
  let error: string | null = null;
  let sYear = now.getFullYear();
  let sMonth = now.getMonth() + 1;

  try {
    // 연도 옵션은 실데이터에서 — 시드 기준일이 실행 시점마다 밀리므로 상수 금지
    const span = await query<{ MinD: string | null; MaxD: string | null }>(
      `SELECT MIN("DocDate") AS "MinD", MAX("DocDate") AS "MaxD" FROM "OINV" WHERE "CANCELED" = 'N'`,
    );
    const minY = span[0]?.MinD ? Number(String(span[0].MinD).slice(0, 4)) : now.getFullYear();
    const maxY = span[0]?.MaxD ? Number(String(span[0].MaxD).slice(0, 4)) : now.getFullYear();
    years = [];
    for (let y = maxY; y >= minY; y -= 1) years.push(y);

    groups = await query<{ ItmsGrpCod: number; ItmsGrpNam: string }>(
      `SELECT "ItmsGrpCod", "ItmsGrpNam" FROM "OITB" ORDER BY "ItmsGrpNam"`,
    );

    const wantY = Number(sp.sYear);
    sYear = years.includes(wantY) ? wantY : (years[0] ?? now.getFullYear());
    const cap = sYear === now.getFullYear() ? now.getMonth() + 1 : 12;
    const wantM = Number(sp.sMonth);
    sMonth = Number.isInteger(wantM) && wantM >= 1 && wantM <= cap ? wantM : cap;
    buckets = monthBuckets(sYear, sMonth);

    // 버킷별 SUM(CASE …) 동적 조립 — 값은 전부 ? 바인딩(식별자만 코드 상수)
    const aggSel = buckets.map(
      (b) => `SUM(CASE WHEN h."DocDate" BETWEEN ? AND ? THEN l."GTotal" ELSE 0 END) AS "${b.key}"`,
    );
    const params: (string | number)[] = buckets.flatMap((b) => [b.from, b.to]);

    const where: string[] = [`h."CANCELED" = 'N'`, `h."DocDate" BETWEEN ? AND ?`];
    params.push(`${sYear}-01-01`, buckets[buckets.length - 1]?.to ?? `${sYear}-12-31`);
    if (sCardCode) {
      where.push(`h."CardCode" = ?`);
      params.push(sCardCode);
    }
    if (tab === "item" && sItemGrp) {
      where.push(`l."ItemCode" IN (SELECT "ItemCode" FROM "OITM" WHERE "ItmsGrpCod" = ?)`);
      params.push(Number(sItemGrp));
    }
    if (tab === "item" && sItemCd) {
      where.push(`l."ItemCode" = ?`);
      params.push(sItemCd);
    }

    const sql =
      tab === "partner"
        ? `SELECT h."CardCode" AS "K1", h."CardName" AS "K2", ${aggSel.join(", ")}
           FROM "OINV" h JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
           WHERE ${where.join(" AND ")}
           GROUP BY h."CardCode", h."CardName"
           ORDER BY SUM(l."GTotal") DESC
           LIMIT ${MAX_DISPLAY}`
        : `SELECT l."ItemCode" AS "K1", COALESCE(i."ItemName", l."Dscription") AS "K2",
                  COALESCE(g."ItmsGrpNam", '') AS "K3", ${aggSel.join(", ")}
           FROM "OINV" h
           JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
           LEFT JOIN "OITM" i ON i."ItemCode" = l."ItemCode"
           LEFT JOIN "OITB" g ON g."ItmsGrpCod" = i."ItmsGrpCod"
           WHERE ${where.join(" AND ")}
           GROUP BY l."ItemCode", COALESCE(i."ItemName", l."Dscription"), COALESCE(g."ItmsGrpNam", '')
           ORDER BY SUM(l."GTotal") DESC
           LIMIT ${MAX_DISPLAY}`;

    const raw = await query<Record<string, string | number | null>>(sql, params);

    // 행합계는 앱단 누적 — 표시 중인 버킷 범위(1월~종료월)만 합산한다
    rows = raw.map((r) => {
      const out: Row = { K1: r.K1, K2: r.K2, K3: r.K3 ?? "" };
      let total = 0;
      for (const b of buckets) {
        const v = Number(r[b.key] ?? 0);
        out[b.key] = v;
        total += v;
      }
      out.RowTotal = total;
      return out;
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const monthCap = sYear === now.getFullYear() ? now.getMonth() + 1 : 12;
  const SEARCH_FIELDS: SearchFieldDef[] = [
    {
      name: "sYear",
      label: "기준년도",
      kind: "select",
      options: years.map((y) => ({ value: String(y), label: `${y}년` })),
    },
    {
      name: "sMonth",
      label: "기준월(종료월)",
      kind: "select",
      options: Array.from({ length: monthCap }, (_, i) => monthCap - i).map((m) => ({
        value: String(m),
        label: `${m}월`,
      })),
    },
    { name: "sCardCode", label: "거래처", kind: "cfl", cflType: "Customer" },
    ...(tab === "item"
      ? ([
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
        ] as SearchFieldDef[])
      : []),
    { name: "tab", label: "구분", kind: "hidden" },
  ];

  const hrefFor = (nextTab: string) => {
    const p = new URLSearchParams({ sYear: String(sYear), sMonth: String(sMonth), tab: nextTab });
    if (sCardCode) p.set("sCardCode", sCardCode);
    if (sItemGrp) p.set("sItemGrp", sItemGrp);
    if (sItemCd) p.set("sItemCd", sItemCd);
    return `/screens/sales-pivot?${p.toString()}`;
  };
  const TABS: TabNavItem[] = [
    { value: "partner", label: "거래처별", href: hrefFor("partner") },
    { value: "item", label: "품목별", href: hrefFor("item") },
  ];

  const columns: Column<Row>[] = [];
  if (tab === "partner") {
    columns.push({ key: "K1", header: "거래처코드", width: "120px", frozen: true, totalLabel: "합계" });
    columns.push({ key: "K2", header: "거래처명", width: "180px", frozen: true });
  } else {
    columns.push({ key: "K1", header: "품목코드", width: "130px", frozen: true, totalLabel: "합계" });
    columns.push({ key: "K2", header: "품명", width: "200px", frozen: true });
    columns.push({ key: "K3", header: "품목그룹", width: "120px", defaultHidden: true });
  }
  for (const b of buckets) {
    columns.push({
      key: b.key,
      header: b.label,
      align: "right",
      width: "110px",
      total: "sum",
      render: (r) => fmtAmt(r[b.key]),
    });
  }
  columns.push({
    key: "RowTotal",
    header: "연간 합계",
    align: "right",
    width: "140px",
    total: "sum",
    render: (r) => {
      const n = Number(r.RowTotal ?? 0);
      return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";
    },
  });

  return (
    <div>
      <PageHeader title="매출 피벗 분석" description="행=거래처/품목 × 열=월 — INV1 GTotal(VAT 포함) 집계" />
      <div className="mb-3">
        <TabNav items={TABS} value={tab} />
      </div>
      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sYear: String(sYear), sMonth: String(sMonth), sCardCode, sItemGrp, sItemCd, tab }}
        storageKey={`b1w:search:sales-pivot:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}개 {tab === "partner" ? "거래처" : "품목"}
            {rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
            <span className="ml-2 text-xs text-faint">
              {sYear}년 1월~{sMonth}월 · 매출액 = VAT 포함(GTotal) · 0 은 빈칸 · 취소 제외
            </span>
          </p>
          <DataGrid<Row>
            columns={columns}
            rows={rows}
            getRowKey={(r) => String(r.K1)}
            emptyText="조건에 맞는 매출 데이터가 없습니다."
            storageKey={`b1w:cols:sales-pivot:${tab}:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

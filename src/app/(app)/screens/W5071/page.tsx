/**
 * W5071 — 재고 수불부 (월별/주별 피벗)
 * 데이터: OINM(재고이동 원장) 단독 집계. 이월 = 기간 시작 이전 순증감(InQty-OutQty),
 *        입고/출고 = 각 기간 버킷 합, 재고 = 이월 + 누적(입고-출고).
 *
 * ⚠️ 원본(레거시 웹 ERP)의 산식은 DB 프로시저 안에 있고 저장소에 없다 — 화면 정의(검색조건 4개,
 *    월별/주별 2탭, 2단 그룹헤더, 좌측 고정열, 하단 합계행)만 이식하고 산식은 우리 원장으로 재구성.
 *    (docs/conversion/specs/W5071.json uncertainties 참조)
 *
 * 🔴 OINM 에 CANCELED 필터를 걸지 않는다 — 문서 취소는 행 삭제가 아니라 '역방향 행 추가'라서
 *    원장을 필터 없이 전부 합산해야 상쇄가 성립한다(엔진 engineCancel). 헤더 조인으로 취소건을
 *    빼면 원행과 역분개행이 같이 사라져 기간 귀속이 뒤틀린다.
 * 🔴 수량 전용 — OINM 에 금액/단가 컬럼(TransValue·CalcPrice)이 없다. 금액 수불부는 만들 수 없다.
 * 패턴: W5060/W3060 복제 + DataGrid 피벗 옵션(group/frozen/total) 사용.
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

function fmtQty(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 해당 월의 말일 (JS Date 의 0일 = 전월 말일) */
function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 월별 탭 버킷 — 기준월은 '종료월'이라 1월부터 그 달까지 펼친다 */
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

/** 주별 탭 버킷 — ISO 주가 아니라 일자 고정 버킷(1-7 / 8-14 / 15-21 / 22-28 / 29-말일) */
function weekBuckets(year: number, month: number): Bucket[] {
  const last = lastDayOf(year, month);
  const out: Bucket[] = [];
  for (let w = 0; w < 5; w += 1) {
    const start = w * 7 + 1;
    if (start > last) break;
    const end = Math.min(start + 6, last);
    out.push({
      key: `w${w + 1}`,
      label: `${w + 1}주차 (${start}일~${end}일)`,
      from: `${year}-${pad2(month)}-${pad2(start)}`,
      to: `${year}-${pad2(month)}-${pad2(end)}`,
    });
  }
  return out;
}

export default async function W5071Page({
  searchParams,
}: {
  searchParams: Promise<{
    sYear?: string;
    sMonth?: string;
    sItemGrp?: string;
    sItemCd?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await getSession();
  const tab = sp.tab === "week" ? "week" : "month";
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
    // 조회옵션 — 연도 범위는 원장 실데이터에서 뽑는다(기초잔액일이 시드 시점마다 밀리므로 상수 금지)
    const span = await query<{ MinD: string | null; MaxD: string | null }>(
      `SELECT MIN("DocDate") AS "MinD", MAX("DocDate") AS "MaxD" FROM "OINM"`,
    );
    const minY = span[0]?.MinD ? Number(String(span[0].MinD).slice(0, 4)) : now.getFullYear();
    const maxY = span[0]?.MaxD ? Number(String(span[0].MaxD).slice(0, 4)) : now.getFullYear();
    years = [];
    for (let y = maxY; y >= minY; y -= 1) years.push(y);

    groups = await query<{ ItmsGrpCod: number; ItmsGrpNam: string }>(
      `SELECT "ItmsGrpCod", "ItmsGrpNam" FROM "OITB" ORDER BY "ItmsGrpNam"`,
    );

    // 기준년도·기준월 확정 (미지정 = 최신 연도 + 그 해의 마지막 유효월). 범위 밖 값은 클램프.
    const wantY = Number(sp.sYear);
    sYear = years.includes(wantY) ? wantY : (years[0] ?? now.getFullYear());
    const cap = sYear === now.getFullYear() ? now.getMonth() + 1 : 12;
    const wantM = Number(sp.sMonth);
    sMonth = Number.isInteger(wantM) && wantM >= 1 && wantM <= cap ? wantM : cap;

    buckets = tab === "week" ? weekBuckets(sYear, sMonth) : monthBuckets(sYear, sMonth);
    // 이월 기준일 — 월별 탭은 해당 연도 1/1 이전, 주별 탭은 기준월 1일 이전
    const openingCut = tab === "week" ? `${sYear}-${pad2(sMonth)}-01` : `${sYear}-01-01`;
    const periodEnd = buckets[buckets.length - 1]?.to ?? openingCut;

    // 집계 SELECT 를 버킷 수만큼 동적 조립 — 값은 전부 ? 바인딩(식별자만 코드 상수)
    const aggSel: string[] = [
      `SUM(CASE WHEN m."DocDate" < ? THEN m."InQty" - m."OutQty" ELSE 0 END) AS "Opening"`,
    ];
    const params: (string | number)[] = [openingCut];
    for (const b of buckets) {
      aggSel.push(`SUM(CASE WHEN m."DocDate" BETWEEN ? AND ? THEN m."InQty" ELSE 0 END) AS "in_${b.key}"`);
      params.push(b.from, b.to);
      aggSel.push(`SUM(CASE WHEN m."DocDate" BETWEEN ? AND ? THEN m."OutQty" ELSE 0 END) AS "out_${b.key}"`);
      params.push(b.from, b.to);
    }
    params.push(periodEnd);

    const where: string[] = [];
    if (sItemGrp) {
      where.push(`i."ItmsGrpCod" = ?`);
      params.push(Number(sItemGrp));
    }
    if (sItemCd) {
      where.push(`i."ItemCode" = ?`);
      params.push(sItemCd);
    }
    const outerCols = [
      `mv."Opening"`,
      ...buckets.flatMap((b) => [`mv."in_${b.key}"`, `mv."out_${b.key}"`]),
    ];

    const sql = `WITH mv AS (
  SELECT m."ItemCode", ${aggSel.join(", ")}
  FROM "OINM" m
  WHERE m."DocDate" <= ?
  GROUP BY m."ItemCode"
)
SELECT i."ItemCode", i."ItemName", COALESCE(g."ItmsGrpNam", '') AS "ItmsGrpNam", ${outerCols.join(", ")}
FROM mv
JOIN "OITM" i ON i."ItemCode" = mv."ItemCode"
LEFT JOIN "OITB" g ON g."ItmsGrpCod" = i."ItmsGrpCod"
${where.length ? `WHERE ${where.join(" AND ")}` : ""}
ORDER BY "ItmsGrpNam", i."ItemCode"
LIMIT ${MAX_DISPLAY}`;

    const raw = await query<Record<string, string | number | null>>(sql, params);

    // 재고(기간말 잔량)는 앱단 누적 — 이월에서 시작해 버킷 순서대로 입고-출고를 누적한다
    rows = raw.map((r) => {
      const opening = Number(r.Opening ?? 0);
      const out: Row = {
        ItemCode: r.ItemCode,
        ItemName: r.ItemName,
        ItmsGrpNam: r.ItmsGrpNam,
        Opening: opening,
      };
      let running = opening;
      for (const b of buckets) {
        const inQty = Number(r[`in_${b.key}`] ?? 0);
        const outQty = Number(r[`out_${b.key}`] ?? 0);
        running += inQty - outQty;
        out[`in_${b.key}`] = inQty;
        out[`out_${b.key}`] = outQty;
        out[`bal_${b.key}`] = running;
      }
      return out;
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const monthCap = sYear === now.getFullYear() ? now.getMonth() + 1 : 12;
  // 원본 관례: 큰 달부터 내림차순
  const monthOptions = Array.from({ length: monthCap }, (_, i) => monthCap - i).map((m) => ({
    value: String(m),
    label: `${m}월`,
  }));

  const SEARCH_FIELDS: SearchFieldDef[] = [
    {
      name: "sYear",
      label: "기준년도",
      kind: "select",
      options: years.map((y) => ({ value: String(y), label: `${y}년` })),
    },
    {
      name: "sMonth",
      label: tab === "week" ? "기준월" : "기준월(종료월)",
      kind: "select",
      options: monthOptions,
    },
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
    // 탭은 화면 상태값 — 조회 버튼을 눌러도 풀리지 않도록 폼에 같이 실어 보낸다
    { name: "tab", label: "구분", kind: "hidden" },
  ];

  const hrefFor = (nextTab: string) => {
    const p = new URLSearchParams({ sYear: String(sYear), sMonth: String(sMonth), tab: nextTab });
    if (sItemGrp) p.set("sItemGrp", sItemGrp);
    if (sItemCd) p.set("sItemCd", sItemCd);
    return `/screens/W5071?${p.toString()}`;
  };
  const TABS: TabNavItem[] = [
    { value: "month", label: "월별", href: hrefFor("month") },
    { value: "week", label: "주별", href: hrefFor("week") },
  ];

  // 컬럼 — 좌측 고정열 + 이월 + 버킷별 (입고/출고/재고) 3열. 그룹헤더가 기간 라벨을 묶는다.
  const columns: Column<Row>[] = [];
  if (tab === "month") {
    columns.push({ key: "ItmsGrpNam", header: "품목그룹명", width: "140px", frozen: true, totalLabel: "합계" });
    columns.push({ key: "ItemCode", header: "품목코드", width: "130px", frozen: true });
  } else {
    columns.push({ key: "ItemCode", header: "품목코드", width: "130px", frozen: true, totalLabel: "합계" });
  }
  columns.push({ key: "ItemName", header: "품명", width: "240px", frozen: true });
  columns.push({
    key: "Opening",
    header: "이월",
    align: "right",
    width: "110px",
    total: "sum",
    render: (r) => fmtQty(r.Opening),
  });
  for (const b of buckets) {
    for (const [prefix, head] of [
      ["in", "입고"],
      ["out", "출고"],
      ["bal", "재고"],
    ] as const) {
      const key = `${prefix}_${b.key}`;
      columns.push({
        key,
        header: head,
        group: b.label,
        align: "right",
        width: tab === "week" ? "110px" : "95px",
        total: "sum",
        render: (r) => fmtQty(r[key]),
      });
    }
  }

  return (
    <div>
      <PageHeader title="재고 수불부" description="W5071 · OINM 원장 집계 (수량 기준)" />
      <div className="mb-3">
        <TabNav items={TABS} value={tab} />
      </div>
      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ sYear: String(sYear), sMonth: String(sMonth), sItemGrp, sItemCd, tab }}
        storageKey={`b1w:search:W5071:${user?.uid ?? "anon"}`}
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
              {tab === "week"
                ? `${sYear}년 ${sMonth}월 · 이월 = ${sMonth}월 1일 이전 잔량`
                : `${sYear}년 1월~${sMonth}월 · 이월 = ${sYear}년 이전 잔량`}
              {" · 수량 기준(원장에 금액 없음) · 취소분은 역분개로 상쇄"}
            </span>
          </p>
          <DataGrid<Row>
            columns={columns}
            rows={rows}
            getRowKey={(r) => String(r.ItemCode)}
            emptyText="조건에 맞는 재고 이동이 없습니다."
            storageKey={`b1w:cols:W5071:${tab}:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

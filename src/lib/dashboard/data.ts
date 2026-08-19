/**
 * 대시보드 실데이터 (서버 전용, read-only HANA 게이트웨이).
 * 쿼리는 dashboard-data-discovery 워크플로가 데모 스키마에서 실측 검증한 것 기반.
 * ⚠️ 테스트 스키마는 데이터가 옛날/희소(최신 2026-06-08) → '오늘' 필터 금지, 최신 데이터월/최신 N건 방식.
 *    HANA DECIMAL은 드라이버가 문자열로 반환할 수 있어 num()으로 강제 변환.
 */
import "server-only";
import { query, queryOne } from "@/lib/db/hana";

export type Kpi = {
  key: string;
  label: string;
  prefix?: string;
  value: string;
  unit?: string;
  delta?: string;
  up?: boolean | null; // true=상승(초록) / false=하락(빨강) / null=중립
  bars: number[];
  detail: string;
  caption?: string;
  available: boolean;
};

export type TxRow = {
  id: number;
  icon: string;
  title: string;
  sub: string;
  amount: string;
  date: string;
  pos: boolean | null;
  /** 지정 시 행 클릭 → 원문서 상세로 이동 (상세페이지 있는 유형만) */
  href?: string;
};

export type OpenDoc = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export type ReceivableRow = {
  cardCode: string;
  cardName: string;
  balance: number;
  href: string;
};

export type SalesTopRow = {
  key: string;
  name: string;
  amount: number;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v)) || 0;

export function compactWon(n: number): { value: string; unit: string } {
  const a = Math.abs(n);
  if (a >= 1e8) return { value: (n / 1e8).toFixed(2), unit: "억" };
  if (a >= 1e4) return { value: Math.round(n / 1e4).toLocaleString("ko-KR"), unit: "만" };
  return { value: Math.round(n).toLocaleString("ko-KR"), unit: "" };
}
export const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

/** 안전 래퍼 — 쿼리 실패 시 available:false 카드로 degrade */
async function safeKpi(fn: () => Promise<Kpi>, fallback: Kpi): Promise<Kpi> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ── 매출 (OINV.DocTotal, 최신 데이터월 기준) ──────────────────
async function salesKpi(): Promise<Kpi> {
  const rows = await query<{ YM: string; Total: unknown; Cnt: unknown }>(
    `SELECT TO_VARCHAR("DocDate",'YYYY-MM') AS "YM", SUM("DocTotal") AS "Total", COUNT(*) AS "Cnt"
     FROM "OINV" WHERE "CANCELED"='N'
     GROUP BY TO_VARCHAR("DocDate",'YYYY-MM') ORDER BY "YM" DESC LIMIT 8`,
  );
  if (!rows.length) throw new Error("no data");
  const latest = rows[0];
  const prev = rows[1];
  const total = num(latest.Total);
  const d = prev ? ((total - num(prev.Total)) / num(prev.Total)) * 100 : 0;
  const { value, unit } = compactWon(total);
  const bars = rows.slice(0, 7).map((r) => num(r.Total)).reverse();
  return {
    key: "sales",
    label: "매출 (A/R 송장)",
    prefix: "₩",
    value,
    unit,
    delta: prev ? `${pct(d)}%` : undefined,
    up: prev ? d >= 0 : null,
    bars,
    caption: `기준월 ${latest.YM}`,
    detail: `${latest.YM} 취소 제외 ${num(latest.Cnt)}건 · 전월(${prev?.YM ?? "-"}) 대비 ${prev ? pct(d) + "%" : "-"}`,
    available: true,
  };
}

// ── 매입 (OPCH.DocTotal, 최신 데이터월 기준 — 매출의 대칭 지표) ──
async function purchaseKpi(): Promise<Kpi> {
  const rows = await query<{ YM: string; Total: unknown; Cnt: unknown }>(
    `SELECT TO_VARCHAR("DocDate",'YYYY-MM') AS "YM", SUM("DocTotal") AS "Total", COUNT(*) AS "Cnt"
     FROM "OPCH" WHERE "CANCELED"='N'
     GROUP BY TO_VARCHAR("DocDate",'YYYY-MM') ORDER BY "YM" DESC LIMIT 8`,
  );
  if (!rows.length) throw new Error("no data");
  const latest = rows[0];
  const prev = rows[1];
  const total = num(latest.Total);
  const d = prev ? ((total - num(prev.Total)) / num(prev.Total)) * 100 : 0;
  const { value, unit } = compactWon(total);
  const bars = rows.slice(0, 7).map((r) => num(r.Total)).reverse();
  return {
    key: "purchase",
    label: "매입 (A/P 송장)",
    prefix: "₩",
    value,
    unit,
    // 매입 증감은 좋고/나쁨이 아니므로 중립(회색)으로 표시 — up:null
    delta: prev ? `${pct(d)}%` : undefined,
    up: null,
    bars,
    caption: `기준월 ${latest.YM}`,
    detail: `${latest.YM} 취소 제외 ${num(latest.Cnt)}건 · 전월(${prev?.YM ?? "-"}) 대비 ${prev ? pct(d) + "%" : "-"}`,
    available: true,
  };
}

// ── 미지급금 (OCRD 공급처 원장잔액 — 미수금의 대칭 지표) ────────
// SAP B1 부호 관례: 공급처(S)에 갚을 채무는 Balance<0 으로 저장 → -Balance 로 양수화.
async function payablesKpi(): Promise<Kpi> {
  // 세 쿼리는 서로 독립 — 공유 DB 에서는 순차로 두면 왕복이 3배가 된다
  const [s, tops, openAp] = await Promise.all([
    queryOne<{ Total: unknown; Cnt: unknown }>(
      `SELECT SUM(CASE WHEN "Balance"<0 THEN -"Balance" ELSE 0 END) AS "Total",
              COUNT(CASE WHEN "Balance"<0 THEN 1 END) AS "Cnt"
       FROM "OCRD" WHERE "CardType"='S'`,
    ),
    query<{ Bal: unknown }>(
      `SELECT -"Balance" AS "Bal" FROM "OCRD"
       WHERE "CardType"='S' AND "Balance"<0 ORDER BY "Balance" ASC LIMIT 7`,
    ),
    queryOne<{ OpenCnt: unknown }>(`SELECT COUNT(*) AS "OpenCnt" FROM "OPCH" WHERE "DocStatus"='O'`),
  ]);
  const total = num(s?.Total);
  const cnt = num(s?.Cnt);
  const { value, unit } = compactWon(total);
  return {
    key: "payables",
    label: "미지급금 (A/P)",
    prefix: "₩",
    value,
    unit,
    delta: `거래처 ${cnt}곳`,
    up: null,
    bars: tops.map((r) => num(r.Bal)),
    caption: "원장 잔액 기준",
    detail: `공급처 채무 ${cnt}곳 · 미결 매입송장 ${num(openAp?.OpenCnt)}건`,
    available: true,
  };
}

// ── 미수금 (OCRD.Balance + 미결 OINV) ─────────────────────────
async function receivablesKpi(): Promise<Kpi> {
  // 세 쿼리는 서로 독립 — 병렬로 던진다(공유 DB 에서 왕복 3 → 1)
  const [s, tops, open] = await Promise.all([
    queryOne<{ Total: unknown; Cnt: unknown }>(
      `SELECT SUM("Balance") AS "Total", COUNT(*) AS "Cnt" FROM "OCRD" WHERE "CardType"='C' AND "Balance">0`,
    ),
    query<{ Balance: unknown }>(
      `SELECT "Balance" FROM "OCRD" WHERE "CardType"='C' AND "Balance">0 ORDER BY "Balance" DESC LIMIT 7`,
    ),
    queryOne<{ OpenCnt: unknown; OverdueCnt: unknown }>(
      `SELECT COUNT(*) AS "OpenCnt",
         SUM(CASE WHEN DAYS_BETWEEN("DocDueDate", CURRENT_DATE) > 30 THEN 1 ELSE 0 END) AS "OverdueCnt"
       FROM "OINV" WHERE "DocStatus"='O'`,
    ),
  ]);
  const total = num(s?.Total);
  const cnt = num(s?.Cnt);
  const { value, unit } = compactWon(total);
  return {
    key: "receivables",
    label: "미수금 (A/R)",
    prefix: "₩",
    value,
    unit,
    delta: `거래처 ${cnt}곳`,
    up: null,
    bars: tops.map((r) => num(r.Balance)),
    caption: "원장 잔액 기준",
    detail: `미결 송장 ${num(open?.OpenCnt)}건 · 30일 초과 연체 ${num(open?.OverdueCnt)}건`,
    available: true,
  };
}

const KPI_FALLBACK = (key: string, label: string): Kpi => ({
  key,
  label,
  value: "—",
  bars: [],
  detail: "데이터를 불러오지 못했습니다.",
  available: false,
});

// ── 미결 현황 (판매오더/구매오더/미청구납품 미결 건수) ──────────
/** 단일 미결 카운트 — 실패 시 count:0으로 degrade */
async function openDocCount(
  table: string,
  key: string,
  label: string,
  href: string,
): Promise<OpenDoc> {
  try {
    const r = await queryOne<{ Cnt: unknown }>(
      `SELECT COUNT(*) AS "Cnt" FROM "${table}" WHERE "DocStatus"=? AND "CANCELED"=?`,
      ["O", "N"],
    );
    return { key, label, count: num(r?.Cnt), href };
  } catch {
    return { key, label, count: 0, href };
  }
}

async function openDocs(): Promise<OpenDoc[]> {
  return Promise.all([
    openDocCount("ORDR", "salesOrders", "판매오더 미결", "/screens/orders?status=O"),
    openDocCount("OPOR", "purchaseOrders", "구매오더 미결", "/screens/purchase-orders?status=O"),
    openDocCount("ODLN", "deliveries", "미청구 납품", "/screens/deliveries?status=O"),
  ]);
}

// ── 미수금 상위 거래처 TOP5 (OCRD.Balance, 고객 유형) ───────────
async function topReceivables(): Promise<ReceivableRow[]> {
  try {
    const rows = await query<{ CardCode: unknown; CardName: unknown; Balance: unknown }>(
      `SELECT TOP 5 "CardCode","CardName","Balance" FROM "OCRD"
       WHERE "CardType"=? AND "Balance">0 ORDER BY "Balance" DESC`,
      ["C"],
    );
    return rows.map((r) => {
      const code = String(r.CardCode ?? "");
      return {
        cardCode: code,
        cardName: String(r.CardName ?? "") || code,
        balance: num(r.Balance),
        href: `/screens/invoices?cardcode=${encodeURIComponent(code)}&status=O`,
      };
    });
  } catch {
    return [];
  }
}

// ── 실적 하이라이트 (최신 데이터월 기준 매출 상위 거래처/품목) ──
async function salesHighlights(): Promise<{
  month: string;
  byCustomer: SalesTopRow[];
  byItem: SalesTopRow[];
}> {
  const empty = { month: "", byCustomer: [] as SalesTopRow[], byItem: [] as SalesTopRow[] };
  try {
    const latest = await queryOne<{ YM: unknown }>(
      `SELECT MAX(TO_VARCHAR("DocDate",'YYYY-MM')) AS "YM" FROM "OINV" WHERE "CANCELED"='N'`,
    );
    const ym = latest?.YM ? String(latest.YM) : "";
    if (!ym) return empty;

    // 상위 거래처·상위 품목은 서로 독립 — 기준월(ym)만 공유하므로 병렬로 던진다
    const [byCustomer, byItem] = await Promise.all([
      query<{ CardCode: unknown; CardName: unknown; Total: unknown }>(
      `SELECT TOP 5 "CardCode", MAX("CardName") AS "CardName", SUM("DocTotal") AS "Total"
       FROM "OINV" WHERE "CANCELED"='N' AND TO_VARCHAR("DocDate",'YYYY-MM')=?
         GROUP BY "CardCode" ORDER BY SUM("DocTotal") DESC`,
        [ym],
      ),
      query<{ ItemCode: unknown; ItemName: unknown; Total: unknown }>(
      `SELECT TOP 5 L."ItemCode", MAX(L."Dscription") AS "ItemName", SUM(L."LineTotal") AS "Total"
       FROM "INV1" L JOIN "OINV" H ON L."DocEntry"=H."DocEntry"
       WHERE H."CANCELED"='N' AND TO_VARCHAR(H."DocDate",'YYYY-MM')=?
         GROUP BY L."ItemCode" ORDER BY SUM(L."LineTotal") DESC`,
        [ym],
      ),
    ]);

    return {
      month: ym,
      byCustomer: byCustomer.map((r) => {
        const code = String(r.CardCode ?? "");
        return { key: code, name: String(r.CardName ?? "") || code, amount: num(r.Total) };
      }),
      byItem: byItem.map((r) => {
        const code = String(r.ItemCode ?? "");
        return { key: code, name: String(r.ItemName ?? "") || code, amount: num(r.Total) };
      }),
    };
  } catch {
    return empty;
  }
}

// ── 최근 트랜잭션 (OJDT 최신 5건) ─────────────────────────────
const TX_MAP: Record<number, { name: string; icon: string; pos: boolean | null }> = {
  13: { name: "매출 세금계산서", icon: "＝", pos: null },
  14: { name: "매출 반품", icon: "↩", pos: false },
  15: { name: "납품 출고", icon: "↑", pos: false },
  18: { name: "매입 세금계산서", icon: "↓", pos: false },
  20: { name: "입고", icon: "↓", pos: true },
  24: { name: "입금", icon: "↓", pos: true },
  30: { name: "분개", icon: "＝", pos: null },
  46: { name: "지급", icon: "↑", pos: false },
  67: { name: "재고 이전", icon: "⇄", pos: null },
};

// 전표 유형 → 상세 라우트. 상세페이지가 있는 문서유형만 클릭 이동 가능.
const TX_ROUTE: Record<number, string> = {
  13: "invoices", // 매출 세금계산서 (OINV)
  15: "deliveries", // 납품 (ODLN)
  18: "purchase-invoices", // 매입 세금계산서 (OPCH)
};

async function transactions(): Promise<TxRow[]> {
  try {
    const rows = await query<{
      TransId: unknown; RefDate: unknown; TransType: unknown; LocTotal: unknown; Memo: unknown;
      BP: unknown; SrcEntry: unknown;
    }>(
      `SELECT TOP 5 T."TransId", T."RefDate", T."TransType", T."LocTotal", T."Memo",
         CASE T."TransType"
           WHEN 13 THEN (SELECT H."CardName" FROM "OINV" H WHERE H."TransId"=T."TransId")
           WHEN 15 THEN (SELECT H."CardName" FROM "ODLN" H WHERE H."TransId"=T."TransId")
           WHEN 18 THEN (SELECT H."CardName" FROM "OPCH" H WHERE H."TransId"=T."TransId")
           ELSE NULL END AS "BP",
         CASE T."TransType"
           WHEN 13 THEN (SELECT H."DocEntry" FROM "OINV" H WHERE H."TransId"=T."TransId")
           WHEN 15 THEN (SELECT H."DocEntry" FROM "ODLN" H WHERE H."TransId"=T."TransId")
           WHEN 18 THEN (SELECT H."DocEntry" FROM "OPCH" H WHERE H."TransId"=T."TransId")
           ELSE NULL END AS "SrcEntry"
       FROM "OJDT" T ORDER BY T."TransId" DESC`,
    );
    return rows.map((r) => {
      const tt = num(r.TransType);
      const meta = TX_MAP[tt] ?? { name: `전표(${tt})`, icon: "＝", pos: null };
      const bp = r.BP ? String(r.BP) : null;
      const memo = r.Memo ? String(r.Memo) : "";
      const route = TX_ROUTE[tt];
      const srcEntry = num(r.SrcEntry);
      return {
        id: num(r.TransId),
        icon: meta.icon,
        title: bp ?? (memo ? memo.split("_")[0] : "내부 전표"),
        sub: meta.name + (bp && memo ? ` · ${memo.slice(0, 20)}` : ""),
        amount: `₩ ${won(num(r.LocTotal))}`,
        date: String(r.RefDate ?? "").slice(0, 10),
        pos: meta.pos,
        href: route && srcEntry > 0 ? `/screens/${route}/${srcEntry}` : undefined,
      };
    });
  } catch {
    return [];
  }
}

export type DashboardData = {
  greeting: string;
  today: string;
  kpis: Kpi[];
  openDocs: OpenDoc[];
  receivables: ReceivableRow[];
  highlights: { month: string; byCustomer: SalesTopRow[]; byItem: SalesTopRow[] };
  transactions: TxRow[];
};

export async function getDashboard(userName: string): Promise<DashboardData> {
  const [sales, purchase, recv, payables, open, receivables, highlights, tx] = await Promise.all([
    safeKpi(salesKpi, KPI_FALLBACK("sales", "매출 (A/R 송장)")),
    safeKpi(purchaseKpi, KPI_FALLBACK("purchase", "매입 (A/P 송장)")),
    safeKpi(receivablesKpi, KPI_FALLBACK("receivables", "미수금 (A/R)")),
    safeKpi(payablesKpi, KPI_FALLBACK("payables", "미지급금 (A/P)")),
    openDocs(),
    topReceivables(),
    salesHighlights(),
    transactions(),
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "좋은 아침입니다" : hour < 18 ? "안녕하세요" : "수고 많으십니다";
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  return {
    greeting: `${greeting}, ${userName}님`,
    today,
    kpis: [sales, purchase, recv, payables],
    openDocs: open,
    receivables,
    highlights,
    transactions: tx,
  };
}

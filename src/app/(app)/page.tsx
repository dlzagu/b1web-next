import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getDashboard, won, compactWon, type TxRow } from "@/lib/dashboard/data";
import KpiGrid from "./dashboard/KpiGrid";
import { cn } from "@/lib/ui/cn";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getSession(); // 레이아웃에서 이미 게이트
  const d = await getDashboard(user?.name ?? "사용자");

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* 헤더 */}
      <div className="animate-rise mb-14">
        <p className="mb-3 text-[13px] font-medium tracking-[0.04em] text-muted">
          {d.today} · 실시간 종합 현황
        </p>
        <h1 className="text-display-md font-semibold text-foreground">
          {d.greeting}
        </h1>
      </div>

      {/* KPI */}
      <div className="mb-16">
        <KpiGrid kpis={d.kpis} />
      </div>

      {/* 미결 현황 — 클릭 시 해당 목록으로 이동 */}
      <section className="animate-rise-2 mb-20">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">미결 현황</h2>
          <span className="text-[13px] font-medium text-muted">처리 대기 문서</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {d.openDocs.map((o) => (
            <Link
              key={o.key}
              href={o.href}
              className="group flex items-center justify-between rounded-card bg-surface-container px-6 py-6 transition-colors hover:bg-surface-2"
            >
              <div>
                <div className="text-sm font-medium text-muted">{o.label}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-display-sm font-semibold text-foreground tabular-nums">
                    {o.count.toLocaleString("ko-KR")}
                  </span>
                  <span className="text-sm font-medium text-muted">건</span>
                </div>
              </div>
              <span className="text-muted transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 미수금 상위 거래처 · 최근 트랜잭션 */}
      <section className="animate-rise-3 grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr]">
        {/* 미수금 상위 거래처 TOP5 */}
        <div>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">미수금 상위 거래처</h2>
            <Link href="/screens/invoices?status=O" className="text-[13px] font-medium text-primary">
              전체보기
            </Link>
          </div>
          {d.receivables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong py-14 text-center">
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-muted">✓</div>
              <p className="text-sm font-medium text-foreground">미수금이 없습니다</p>
              <p className="mt-1 text-xs text-muted">잔액이 있는 고객이 생기면 여기에 표시됩니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {d.receivables.map((r, i) => (
                <Link
                  key={r.cardCode}
                  href={r.href}
                  className="flex items-center justify-between rounded-card bg-surface-container px-5 py-4 transition-colors hover:bg-surface-2"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{r.cardName}</div>
                      <div className="truncate text-xs text-muted">{r.cardCode}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    ₩ {won(r.balance)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 최근 트랜잭션 */}
        <div>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">최근 트랜잭션</h2>
            <span className="text-[13px] font-medium text-primary">전체보기</span>
          </div>
          {d.transactions.length === 0 ? (
            <p className="rounded-card bg-surface-container px-5 py-8 text-center text-sm text-muted">
              최근 전표가 없습니다
            </p>
          ) : (
            <div className="flex flex-col">
              {d.transactions.map((t) => (
                <TxItem key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 실적 하이라이트 — 최신 데이터월 매출 상위 거래처/품목 */}
      {(d.highlights.byCustomer.length > 0 || d.highlights.byItem.length > 0) && (
        <section className="animate-rise-3 mt-20">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">실적 하이라이트</h2>
            {d.highlights.month && (
              <span className="text-[13px] font-medium text-muted">기준월 {d.highlights.month}</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <HighlightList title="매출 상위 거래처" rows={d.highlights.byCustomer} />
            <HighlightList title="매출 상위 품목" rows={d.highlights.byItem} />
          </div>
        </section>
      )}
    </div>
  );
}

/** 최근 트랜잭션 한 행 — href 있으면 원문서 상세로 이동(Link), 없으면 비클릭(div) */
function TxItem({ t }: { t: TxRow }) {
  const cls =
    "flex items-center gap-4 border-b border-border px-1 py-4 transition-colors last:border-0 hover:bg-surface-2/60";
  const body = (
    <>
      <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">
        {t.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{t.title}</div>
        <div className="truncate text-xs text-muted">{t.sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            t.pos === true ? "text-success" : "text-foreground",
          )}
        >
          {t.amount}
        </div>
        <div className="text-[11px] tabular-nums text-faint">{t.date}</div>
      </div>
    </>
  );
  return t.href ? (
    <Link href={t.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function HighlightList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; amount: number }[];
}) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-muted">{title}</div>
      {rows.length === 0 ? (
        <p className="rounded-card bg-surface-container px-5 py-6 text-center text-sm text-muted">
          데이터가 없습니다
        </p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r, i) => {
            const c = compactWon(r.amount);
            return (
              <div
                key={r.key}
                className="flex items-center gap-3 border-b border-border py-3 last:border-0"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold tabular-nums text-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  ₩ {c.value}
                  {c.unit && <span className="ml-0.5 text-xs font-medium text-muted">{c.unit}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

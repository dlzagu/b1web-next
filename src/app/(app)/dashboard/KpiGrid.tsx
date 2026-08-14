"use client";

import { useState } from "react";
import { cn } from "@/lib/ui/cn";
import type { Kpi } from "@/lib/dashboard/data";

/**
 * KPI 그리드 — AXIS 디자인 재현. 4열, 1px 헤어라인 구분(gap-px + bg-border),
 * hover 시 상세(스파크라인 + 캡션) 확장. 값/추이는 서버(실 SAP)에서 계산해 주입.
 */
export default function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <section className="animate-rise-2 grid grid-cols-1 gap-px overflow-hidden rounded-panel bg-border sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k, i) => {
        const active = hover === i;
        const max = Math.max(...k.bars, 1);
        return (
          <div
            key={k.key}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="relative cursor-default bg-surface px-7 py-8"
          >
            <div className="mb-7 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{k.label}</span>
              {k.delta && (
                <span
                  className={cn(
                    "text-xs font-semibold tracking-tight",
                    k.up === true ? "text-success" : k.up === false ? "text-danger" : "text-muted",
                  )}
                >
                  {k.delta}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1">
              {k.prefix && <span className="text-[15px] font-medium text-muted">{k.prefix}</span>}
              <span className="text-display-lg font-semibold text-foreground">
                {k.value}
              </span>
              {k.unit && <span className="text-[15px] font-medium text-muted">{k.unit}</span>}
            </div>
            {k.caption && <p className="mt-2.5 text-[11px] text-faint">{k.caption}</p>}

            <div
              className={cn(
                "overflow-hidden transition-all duration-500 ease-out",
                active ? "max-h-44 opacity-100" : "max-h-0 opacity-0",
              )}
            >
              <div className="mt-5 border-t border-border pt-5">
                {k.bars.length > 0 && (
                  <div className="mb-3.5 flex h-9 items-end gap-1">
                    {k.bars.map((b, bi) => (
                      <div
                        key={bi}
                        className={cn(
                          "flex-1 rounded-[2px]",
                          bi === k.bars.length - 1 ? "bg-primary" : "bg-foreground/10",
                        )}
                        style={{ height: `${Math.max(6, (b / max) * 100)}%` }}
                      />
                    ))}
                  </div>
                )}
                <p className="text-xs leading-relaxed text-muted">{k.detail}</p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

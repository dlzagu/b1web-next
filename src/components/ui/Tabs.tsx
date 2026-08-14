/**
 * Tabs — 세그먼트형 / 언더라인형 탭 (Antigravity 레퍼런스 병합).
 * 비-headless 제어형: 부모가 value/onValueChange 소유. items = {value,label}[].
 * - segmented: 컨테이너 pill + 각 세그먼트 pill border(active=다크 #121317 / inactive=옅은 경계)
 * - underline: 하단 밑줄(active=포인트블루 / inactive=밑줄없음+muted)
 */
"use client";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export type TabItem = { value: string; label: ReactNode };

const segmentItem = cva(
  "rounded-pill border px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      active: {
        true: "border-foreground text-foreground",
        false: "border-border-subtle text-muted hover:text-foreground",
      },
    },
  },
);

const underlineItem = cva(
  "-mb-px border-b px-1 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      active: {
        true: "border-primary text-foreground",
        false: "border-transparent text-muted hover:text-foreground",
      },
    },
  },
);

export default function Tabs({
  items,
  value,
  onValueChange,
  variant = "segmented",
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: "segmented" | "underline";
  className?: string;
}) {
  if (variant === "underline") {
    return (
      <div className={cn("flex items-center gap-6 border-b border-border", className)}>
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            onClick={() => onValueChange(it.value)}
            className={underlineItem({ active: it.value === value })}
          >
            {it.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-pill bg-surface-2 p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onValueChange(it.value)}
          className={segmentItem({ active: it.value === value })}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

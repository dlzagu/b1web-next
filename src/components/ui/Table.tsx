/**
 * Table 프리미티브 — 밀도 우선 표(헤어라인 경계, 촘촘한 행). 가로 스크롤 컨테이너 내장.
 * DataGrid(상위 래퍼)와 임의 표(주문 라인 등)가 공통 사용.
 */
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-card border border-border">
      <table className={cn("w-full min-w-max border-collapse text-sm", className)} {...props} />
    </div>
  );
}

/** 스크롤/보더 컨테이너 없이 table만 (Card 내부 등에서). */
export function TableBare({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-max border-collapse text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-2", className)} {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border last:border-0", className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-2 text-[13px] text-foreground", className)} {...props} />
  );
}

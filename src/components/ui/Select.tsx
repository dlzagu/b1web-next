/** Select — 토큰 스타일 네이티브 select. chevron은 globals의 .b1w-select 클래스로. */
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";
import { fieldBase } from "./Input";

export default function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "b1w-select", className)} {...props}>
      {children}
    </select>
  );
}

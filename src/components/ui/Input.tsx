/** Input — 토큰 스타일 네이티브 input (AXIS: 부드러운 라운드·헤어라인). React19 ref-as-prop. */
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const fieldBase =
  "h-9 w-full rounded-field border border-border-strong bg-surface px-3 text-[13px] text-foreground placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50";

export default function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

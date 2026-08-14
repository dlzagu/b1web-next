/** Field — 라벨 + 컨트롤 세로 조합(폼 밀집 정렬). required 별표·힌트 지원. */
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function Label({
  children,
  required,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("text-xs font-medium text-muted", className)}>
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </span>
  );
}

export default function Field({
  label,
  required,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("flex flex-col gap-1", className)}>
      {label && (
        <Label required={required}>{label}</Label>
      )}
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

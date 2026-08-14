/** Badge — 상태/구분 라벨(문서상태·준비중 등). 시맨틱 서브틀 토큰. */
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-muted",
        primary: "bg-primary-subtle text-primary",
        success: "bg-success-bg text-success-fg",
        danger: "bg-danger-bg text-danger-fg",
        warning: "bg-warning-bg text-warning-fg",
        info: "bg-info-bg text-info-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export default function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

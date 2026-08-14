/**
 * Button — 코어 프리미티브 (AXIS 디자인: 애플식 pill 버튼). cva 변형.
 * 토큰 기반. Link 감쌀 땐 buttonVariants({...}) 클래스만 사용.
 */
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-pill font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-btn-primary text-white hover:bg-btn-primary-hover",
        secondary: "bg-surface-2 text-foreground hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        danger: "bg-danger text-white hover:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        md: "h-9 px-5 text-[13px]",
        lg: "h-11 px-6 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export default function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

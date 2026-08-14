import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — 조건부 클래스 결합 + Tailwind 충돌 해소(shadcn 패턴 표준 헬퍼).
 * 예: cn("px-2", isActive && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

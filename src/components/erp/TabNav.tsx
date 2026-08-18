"use client";

/**
 * TabNav — URL 로 상태를 유지하는 탭 (디자인은 ui/Tabs 재사용).
 * 서버 컴포넌트 화면에서 탭을 쓰려면 onValueChange(함수)를 넘길 수 없으므로,
 * 탭별 href 를 받아 클라에서 내비게이션한다 — 새로고침·뒤로가기·링크공유가 그대로 동작.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export type TabNavItem = { value: string; label: string; href: string };

export default function TabNav({
  items,
  value,
  variant = "segmented",
  className,
}: {
  items: TabNavItem[];
  /** 현재 선택된 탭 value */
  value: string;
  variant?: "segmented" | "underline";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startNav] = useTransition();
  return (
    <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60", className)}>
      <Tabs
        items={items.map((i) => ({ value: i.value, label: i.label }))}
        value={value}
        variant={variant}
        onValueChange={(v) => {
          const href = items.find((i) => i.value === v)?.href;
          if (href) startNav(() => router.push(href));
        }}
      />
    </div>
  );
}

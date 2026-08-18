"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MENU } from "@/lib/menu";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

/** 그룹 접기 화살표 — 펼침=아래(v), 접힘=오른쪽(>) */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * 메뉴 목록 본체 — 데스크톱 사이드바와 모바일 드로어가 **같은 렌더링**을 공유한다.
 * onNavigate: 드로어에서 항목을 누르면 닫히게 하는 콜백(데스크톱은 미지정).
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // 접힌 그룹 id 집합. 레이아웃이 소프트내비 동안 유지되므로 화면 이동에도 상태 보존.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {MENU.map((group) => {
        const visible = group.items.filter((item) => !item.hidden);
        if (visible.length === 0) return null; // 전 항목 숨김이면 그룹 자체 미표시
        const open = !collapsed.has(group.id);
        return (
          // 그룹 간 큰 여백 = 위계의 1차 신호(한글은 uppercase 무효라 여백·들여쓰기로 구분)
          <div key={group.id} className="mt-6 first:mt-0">
            {/* 그룹 헤더 = 섹션 이름표. 작은 대문자 스타일 대신 굵기·자간·색으로 '라벨'임을 표시 */}
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between rounded-field px-2 py-1 text-[11px] font-bold tracking-[0.04em] text-faint transition-colors hover:text-muted"
            >
              <span>{group.label}</span>
              <Chevron open={open} />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              {/* 항목 목록 = 좌측 헤어라인 레일로 그룹에 종속됨을 표시(들여쓰기 nesting) */}
              <ul className="ml-[11px] mt-1 flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-border-subtle pl-2">
                {visible.map((item) => {
                  const active = pathname === item.href;
                  if (!item.ready) {
                    return (
                      <li key={item.id}>
                        <span
                          title="준비중"
                          className="flex cursor-not-allowed items-center justify-between rounded-field px-2.5 py-1.5 text-[13px] text-faint"
                        >
                          {item.label}
                          <Badge variant="neutral">준비중</Badge>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center rounded-field px-2.5 py-1.5 text-[13px] transition-colors",
                          active
                            ? "bg-primary-subtle font-semibold text-primary"
                            : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** 데스크톱 사이드바 — 모바일(md 미만)에서는 숨기고 헤더의 드로어(MobileNav)가 대신한다 */
export default function Sidebar() {
  return (
    <nav className="c4-scroll hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 md:flex">
      <NavList />
    </nav>
  );
}

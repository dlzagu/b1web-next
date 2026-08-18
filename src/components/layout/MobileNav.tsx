"use client";

/**
 * 모바일 내비게이션 — 헤더의 햄버거 + 좌측 오프캔버스 드로어 (md 미만에서만 보인다).
 * 데스크톱 사이드바(w-56 고정)를 좁은 화면에 그대로 두면 375px 기준 콘텐츠가 90px 도 안 남는다.
 * 메뉴 렌더링은 Sidebar 의 NavList 를 그대로 재사용해 두 벌이 어긋나지 않게 한다.
 *
 * 🔴 드로어는 반드시 **body 로 포털**한다 — 헤더에 backdrop-blur 가 걸려 있고,
 *    backdrop-filter 는 fixed 자식의 기준 박스를 만든다. 헤더 안에 두면 드로어가
 *    뷰포트가 아니라 헤더 높이(60px)에 갇혀 메뉴가 안 보인다(실제로 밟은 버그).
 * 열려 있을 때만 마운트하므로 진입 효과는 transition 이 아니라 keyframe(animate-drawer)이다.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavList } from "./Sidebar";

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function MobileNav() {
  // 드로어 안의 링크는 전부 onNavigate 로 닫으므로 라우트 감시 effect 는 두지 않는다
  const [open, setOpen] = useState(false);

  // 열려 있는 동안 배경 스크롤 잠금 + Esc 닫기
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className="-ml-1 grid h-9 w-9 place-items-center rounded-field text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <MenuIcon />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] md:hidden">
            {/* 배경 딤 — 클릭하면 닫힌다 */}
            <div
              className="animate-fade absolute inset-0 bg-foreground/30"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              className="c4-scroll animate-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 shadow-card"
            >
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-[13px] font-semibold text-foreground">메뉴</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="메뉴 닫기"
                  className="grid h-8 w-8 place-items-center rounded-field text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <CloseIcon />
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

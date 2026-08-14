/**
 * PageHeader — 조회/문서 화면 상단 (제목 + 설명 + 우측 액션).
 * ERP 공통 래퍼: 토큰 기반(다크 분기 없음). CLAUDE.md UI 경계.
 */
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  actions,
}: {
  title: string;
  /** 화면 내부 노트(데이터소스·컨버전 메모) — UI에 렌더하지 않음(dev 참고용). 화면들이 계속 전달 가능. */
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
        {/* description은 화면 내부 노트(데이터소스·컨버전 메모)라 UI에 렌더하지 않음(높이 확보). prop은 dev 참고용으로 유지. */}
        {/* {description && <p className="mt-0.5 text-sm text-muted">{description}</p>} */}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

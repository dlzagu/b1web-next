"use client";

/**
 * DocumentFormShell — 레거시 DocBase.jsp(SAP B1 문서창) 골격의 재사용 셸.
 * 상단 바(제목·상태·액션) + 헤더 슬롯 + 탭(내용/상세/기타) + 하단 합계 슬롯.
 * 문서종류별(판매오더·납품·송장·구매…) 폼이 이 셸을 공유한다. 필드/라인/액션은 주입.
 */
import { useState, type ReactNode } from "react";
import Tabs from "@/components/ui/Tabs";

export type DocTab = { value: string; label: ReactNode; content: ReactNode };

export function DocumentFormShell({
  title,
  status,
  actions,
  header,
  tabs,
  footer,
}: {
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  /** 헤더 3열 카드 (거래처 / 문서·상태 / 일자·통화) */
  header: ReactNode;
  tabs: DocTab[];
  /** 하단 합계 바 (수량/공급가액/부가세/합계) */
  footer?: ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.value ?? "");
  const current = tabs.find((t) => t.value === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 바 — 제목/상태 + 액션 (DocBase card-header 우측 버튼군) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {status}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* 헤더 3열 */}
      {header}

      {/* 탭 (내용/상세/기타) */}
      <div>
        <div className="mb-3">
          <Tabs
            items={tabs.map((t) => ({ value: t.value, label: t.label }))}
            value={active}
            onValueChange={setActive}
            variant="underline"
          />
        </div>
        <div>{current?.content}</div>
      </div>

      {/* 하단 합계 */}
      {footer}
    </div>
  );
}

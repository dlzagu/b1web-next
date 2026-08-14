/**
 * DetailTabs — 상세화면 섹션 탭 래퍼(D-3, 미사용 Tabs 프리미티브 배선).
 * 서버 상세 페이지가 각 섹션(문서정보 Card·라인 그리드·연관 패널)을 렌더한 ReactNode 를
 * content 로 넘기면, 언더라인 탭으로 전환한다. 데이터 패칭은 서버에 그대로 두고 표시만 클라이언트 전환.
 * 비활성 탭은 hidden 으로 언마운트하지 않아(그리드 상태·스크롤 보존) 재조회 없음.
 */
"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui";

export type DetailTab = {
  value: string;
  label: string;
  /** 라벨 옆 개수 뱃지(라인 수·건수 등) — 없으면 미표시 */
  count?: number;
  content: ReactNode;
};

export function DetailTabs({ tabs, className }: { tabs: DetailTab[]; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.value ?? "");

  return (
    <div className={className}>
      <Tabs
        variant="underline"
        className="mb-5"
        items={tabs.map((t) => ({
          value: t.value,
          label:
            t.count != null ? (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                <span className="tabular-nums text-faint">{t.count.toLocaleString()}</span>
              </span>
            ) : (
              t.label
            ),
        }))}
        value={active}
        onValueChange={setActive}
      />
      {tabs.map((t) => (
        <div key={t.value} hidden={t.value !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

"use client";

/**
 * ViewToggle — 조회화면 문서별/라인별 보기 전환 (URL ?view=line). 다른 검색조건은 보존.
 * 서버가 view 를 읽어 문서단위(헤더 1행) vs 라인단위(문서×라인 조인) 그리드를 렌더한다.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function ViewToggle({ value }: { value: "doc" | "line" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const go = (v: "doc" | "line") => {
    if (v === value) return;
    const params = new URLSearchParams(sp.toString());
    if (v === "line") params.set("view", "line");
    else params.delete("view");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const base = "px-3 py-1 text-xs transition-colors";
  const on = "bg-btn-primary text-white";
  const off = "text-muted hover:bg-surface-2 hover:text-foreground";

  return (
    <div className="inline-flex overflow-hidden rounded-field border border-border" role="group" aria-label="보기 전환">
      <button type="button" onClick={() => go("doc")} aria-pressed={value === "doc"} className={`${base} ${value === "doc" ? on : off}`}>
        문서별
      </button>
      <button type="button" onClick={() => go("line")} aria-pressed={value === "line"} className={`${base} border-l border-border ${value === "line" ? on : off}`}>
        라인별
      </button>
    </div>
  );
}

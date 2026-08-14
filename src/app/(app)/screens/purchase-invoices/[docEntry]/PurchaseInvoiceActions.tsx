"use client";

/**
 * 매입 세금계산서 상세 액션 — [취소](확인 2단계). cancelPurchaseInvoice 서버액션(상태가드) → 성공 시 router.refresh.
 * editable=false(취소/마감)면 아무것도 노출하지 않음. (목록 링크는 DocBaseDetail 액션바가 추가)
 * ※ 매입송장은 최종문서라 후속생성 링크 없음(취소 전용).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cancelPurchaseInvoice } from "../_form/actions";

export function PurchaseInvoiceActions({ docEntry, editable }: { docEntry: number; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!editable) return null;

  const doCancel = () =>
    start(async () => {
      setErr(null);
      const r = await cancelPurchaseInvoice(docEntry);
      if (r.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setErr(r.error);
      }
    });

  return (
    <span className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)} className="text-danger hover:text-danger">
          취소
        </Button>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-muted">문서 취소?</span>
          <Button variant="outline" size="sm" onClick={doCancel} disabled={pending} className="text-danger hover:text-danger">
            {pending ? "처리 중…" : "확인"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            아니오
          </Button>
        </span>
      )}
      {err && <span className="text-xs text-danger-fg">{err}</span>}
    </span>
  );
}

"use client";

/**
 * 구매입고 상세 액션 — [매입송장 생성][취소]. (목록 링크는 DocBaseDetail 액션바가 추가)
 * 취소는 cancelPurchaseDelivery 서버 액션(상태 가드) → 성공 시 router.refresh.
 * 매입송장 생성은 입고→매입송장 문서연결 폼으로(fromPurchaseDelivery). editable=false(취소/마감)면 아무 액션도 노출 안 함.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui";
import { cancelPurchaseDelivery } from "../_form/actions";

export function PurchaseDeliveryActions({ docEntry, editable }: { docEntry: number; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doCancel = () =>
    start(async () => {
      setErr(null);
      const r = await cancelPurchaseDelivery(docEntry);
      if (r.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setErr(r.error);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        <Link
          href={`/screens/purchase-invoices/new?fromPurchaseDelivery=${docEntry}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          매입송장 생성
        </Link>
      )}
      {editable &&
        (!confirming ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
            className="text-danger hover:text-danger"
          >
            취소
          </Button>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted">문서 취소?</span>
            <Button
              variant="outline"
              size="sm"
              onClick={doCancel}
              disabled={pending}
              className="text-danger hover:text-danger"
            >
              {pending ? "처리 중…" : "확인"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              아니오
            </Button>
          </span>
        ))}
      {err && <span className="text-xs text-danger-fg">{err}</span>}
    </div>
  );
}

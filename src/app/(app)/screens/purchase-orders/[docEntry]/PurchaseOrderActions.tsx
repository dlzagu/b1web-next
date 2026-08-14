"use client";

/**
 * 구매오더 상세 액션 — [수정][취소][구매입고 생성]. (목록 링크는 DocBaseDetail 액션바가 추가)
 * 취소는 cancelPurchaseOrder 서버 액션(상태 가드 포함) → 성공 시 router.refresh 로 상세 갱신.
 * editable=false(취소/마감 문서)면 아무 액션도 노출하지 않음.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui";
import { cancelPurchaseOrder } from "../_form/actions";

export function PurchaseOrderActions({ docEntry, editable = true }: { docEntry: number; editable?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doCancel = () =>
    start(async () => {
      setErr(null);
      const r = await cancelPurchaseOrder(docEntry);
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
        <Link href={`/screens/purchase-orders/${docEntry}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          수정
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
      {editable && (
        <Link
          href={`/screens/purchase-deliveries/new?fromPurchaseOrder=${docEntry}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          구매입고 생성
        </Link>
      )}
      {err && <span className="text-xs text-danger-fg">{err}</span>}
    </div>
  );
}

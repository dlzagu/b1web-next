"use client";

/**
 * 납품 상세 액션 — [송장 생성][취소]. (목록 링크는 DocBaseDetail 액션바가 추가)
 * 취소는 cancelDelivery 서버 액션(상태 가드) → 성공 시 router.refresh.
 * 송장 생성은 납품→송장 문서연결 폼으로(fromDelivery). editable=false(취소/마감)면 아무 액션도 노출 안 함.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui";
import { cancelDelivery } from "../_form/actions";

export function DeliveryActions({ docEntry, editable }: { docEntry: number; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doCancel = () =>
    start(async () => {
      setErr(null);
      const r = await cancelDelivery(docEntry);
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
          href={`/screens/invoices/new?fromDelivery=${docEntry}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          송장 생성
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

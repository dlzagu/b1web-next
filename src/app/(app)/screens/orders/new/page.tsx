/**
 * 판매오더 입력(생성) — 공유 OrderForm(create 모드), 레거시 DocBase식 문서폼.
 * 제목·액션바는 폼 내부 DocumentFormShell이 소유. 참조데이터는 서버 로드, 거래처·품목은 CflPicker.
 */
import OrderForm from "../_form/OrderForm";
import { loadOrderRefs } from "../_form/refs";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const user = await getSession();
  const uid = user?.uid ?? "anon";
  let refs: Awaited<ReturnType<typeof loadOrderRefs>> | null = null;
  let error: string | null = null;
  try {
    refs = await loadOrderRefs();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-6xl">
      {error || !refs ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          참조데이터 로드 오류: {error}
        </div>
      ) : (
        <OrderForm
          mode="create"
          refs={refs}
          storageNs="orders"
          uid={uid}
          initial={{
            cardCode: "",
            cardName: "",
            currency: "KRW",
            docDate: "2026-05-15",
            docDueDate: "2026-05-20",
            bplId: "",
            slpCode: "",
            numAtCard: "",
            paymentGroup: "",
            journalMemo: "",
            docNum: "",
            comments: "",
            headerUdf: {},
            lines: [],
          }}
        />
      )}
    </div>
  );
}

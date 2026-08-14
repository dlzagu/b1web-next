/**
 * 납품 생성 — 오더→납품 문서연결(DocBase 셸). ?fromOrder=<DocEntry> 있으면 그 오더 미납라인 사전 draw.
 * 없으면 빈 폼 → 폼 안의 [가져오기]로 오더 선택. (범용 draw 코어/폼 재사용)
 */
import DeliveryForm from "../_form/DeliveryForm";
import { DELIVERY_DRAW } from "../_form/config";
import { loadBaseOpenLines } from "../../_shared/draw/core";
import type { DrawLineValue } from "../../_shared/draw/types";
import { loadTableUdfs } from "@/lib/db/udf";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ fromOrder?: string }>;
}) {
  const sp = await searchParams;
  const fromOrder = Number(sp.fromOrder);

  // 헤더 UDF(ODLN) — 상세 헤더선택대로 입력칸 노출. uid 는 상세와 동일 저장키 공유용.
  const user = await getSession();
  const uid = user?.uid ?? "anon";
  const headerUdfs = await loadTableUdfs("ODLN");
  const lineUdfs = await loadTableUdfs("DLN1");

  let cardCode = "";
  let cardName = "";
  let currency = "KRW";
  let lines: DrawLineValue[] = [];
  let error: string | null = null;

  if (Number.isInteger(fromOrder) && fromOrder > 0) {
    try {
      const { header, lines: openLines } = await loadBaseOpenLines(DELIVERY_DRAW, fromOrder);
      if (header) {
        cardCode = header.cardCode;
        cardName = header.cardName;
        currency = header.docCur ?? "KRW";
        lines = openLines.map((ln, i) => ({
          key: `p${i}`,
          baseEntry: ln.baseEntry,
          baseLine: ln.baseLine,
          itemCode: ln.itemCode,
          itemName: ln.itemName ?? ln.itemCode,
          baseQty: Number(ln.baseQty),
          openQty: Number(ln.openQty),
          quantity: String(ln.openQty),
          price: Number(ln.price),
          whsCode: ln.whsCode,
          whsName: ln.whsName ?? "",
        }));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          참조 오더 로드 오류: {error}
        </div>
      ) : (
        <DeliveryForm
          storageNs="deliveries"
          uid={uid}
          headerUdfs={headerUdfs}
          lineUdfs={lineUdfs}
          initial={{
            cardCode,
            cardName,
            currency,
            docDate: "2026-05-15",
            docDueDate: "2026-05-20",
            numAtCard: "",
            comments: "",
            headerUdf: {},
            lines,
          }}
        />
      )}
    </div>
  );
}

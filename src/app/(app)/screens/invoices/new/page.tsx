/**
 * 매출 세금계산서 생성 — 납품→송장 문서연결(DocBase 셸). ?fromDelivery=<DocEntry> 있으면 그 납품 미청구라인 사전 draw.
 * 없으면 빈 폼 → 폼 안의 [가져오기]로 납품 선택. (범용 draw 코어/폼 재사용)
 */
import InvoiceForm from "../_form/InvoiceForm";
import { INVOICE_DRAW } from "../_form/config";
import { loadBaseOpenLines } from "../../_shared/draw/core";
import type { DrawLineValue } from "../../_shared/draw/types";
import { loadTableUdfs } from "@/lib/db/udf";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ fromDelivery?: string }>;
}) {
  const sp = await searchParams;
  const fromDelivery = Number(sp.fromDelivery);

  // 헤더 UDF(OINV) — 상세 헤더선택대로 입력칸 노출. uid 는 상세와 동일 저장키 공유용.
  const user = await getSession();
  const uid = user?.uid ?? "anon";
  const headerUdfs = await loadTableUdfs("OINV");
  const lineUdfs = await loadTableUdfs("INV1");

  let cardCode = "";
  let cardName = "";
  let currency = "KRW";
  let lines: DrawLineValue[] = [];
  let error: string | null = null;

  if (Number.isInteger(fromDelivery) && fromDelivery > 0) {
    try {
      const { header, lines: openLines } = await loadBaseOpenLines(INVOICE_DRAW, fromDelivery);
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
          참조 납품 로드 오류: {error}
        </div>
      ) : (
        <InvoiceForm
          storageNs="invoices"
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

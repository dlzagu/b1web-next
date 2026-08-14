/**
 * 판매주문 수정 — 상세([docEntry])의 [수정] 진입점.
 * ORDR 헤더 + RDR1 라인을 로드해 OrderForm(edit 모드)에 프리필. 취소/마감 문서는 편집 차단.
 * 편집 허용 = 납기일·적요·라인(PATCH 전체교체). CardCode·전기일·지점은 게시 후 제약이라 읽기전용.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db/hana";
import { udfSelectFragment } from "@/lib/db/udf";
import { getSession } from "@/lib/auth/session";
import OrderForm from "../../_form/OrderForm";
import { loadOrderRefs } from "../../_form/refs";
import type { OrderLineValue } from "../../_form/types";

export const dynamic = "force-dynamic";

type OrderHeader = {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  DocCur: string | null;
  DocDate: string;
  DocDueDate: string;
  BPLId: number;
  SlpCode: number | null;
  NumAtCard: string | null;
  GroupNum: number | null;
  JrnlMemo: string | null;
  Comments: string | null;
  CANCELED: string;
  DocStatus: string;
};

type LineRow = {
  LineNum: number;
  ItemCode: string;
  Dscription: string | null;
  Quantity: number;
  Price: number;
  VatGroup: string | null;
  ShipDate: string | null;
  WhsCode: string;
  OcrCode: string | null;
};

export default async function EditOrderPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  const id = Number(docEntry);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await getSession();
  const uid = user?.uid ?? "anon";

  let header: (OrderHeader & Record<string, unknown>) | null = null;
  let lines: (LineRow & Record<string, unknown>)[] = [];
  let refs: Awaited<ReturnType<typeof loadOrderRefs>> | null = null;
  let error: string | null = null;

  try {
    refs = await loadOrderRefs();
    const hs = await query<OrderHeader & Record<string, unknown>>(
      `SELECT o."DocEntry", o."DocNum", o."CardCode", o."CardName", o."DocCur",
              TO_VARCHAR(o."DocDate",'YYYY-MM-DD') AS "DocDate",
              TO_VARCHAR(o."DocDueDate",'YYYY-MM-DD') AS "DocDueDate",
              o."BPLId", o."SlpCode", o."NumAtCard", o."GroupNum", o."JrnlMemo",
              o."Comments", o."CANCELED", o."DocStatus"${udfSelectFragment(refs.headerUdfs, "o")}
       FROM "ORDR" o WHERE o."DocEntry" = ?`,
      [id],
    );
    header = hs[0] ?? null;
    if (header) {
      lines = await query<LineRow & Record<string, unknown>>(
        `SELECT l."LineNum", l."ItemCode", l."Dscription", l."Quantity", l."Price",
                l."VatGroup", TO_VARCHAR(l."ShipDate",'YYYY-MM-DD') AS "ShipDate",
                l."WhsCode", l."OcrCode"${udfSelectFragment(refs.lineUdfs, "l")}
         FROM "RDR1" l WHERE l."DocEntry" = ? ORDER BY l."LineNum"`,
        [id],
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!error && !header) notFound();
  const blocked = header && (header.CANCELED === "Y" || header.DocStatus === "C");

  // UDF 프리필 — 수정 저장 시 기존 값 보존(PATCH 전체교체라 미프리필 시 클리어됨)
  const headerUdfDefs = refs?.headerUdfs ?? [];
  const lineUdfDefs = refs?.lineUdfs ?? [];
  const headerUdfInit: Record<string, string> = {};
  if (header) for (const u of headerUdfDefs) headerUdfInit[u.column] = header[u.column] != null ? String(header[u.column]) : "";

  return (
    <div className="mx-auto max-w-6xl">
      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>
      ) : blocked ? (
        <div className="rounded-card border border-warning/30 bg-warning-bg p-4 text-sm text-warning-fg">
          {header?.CANCELED === "Y" ? "이미 취소된 문서" : "닫힌(마감) 문서"}는 수정할 수 없습니다.{" "}
          <Link href={`/screens/orders/${id}`} className="font-medium underline">
            상세로 돌아가기
          </Link>
        </div>
      ) : header && refs ? (
        <OrderForm
          mode="edit"
          docEntry={id}
          refs={refs}
          storageNs="orders"
          uid={uid}
          initial={{
            cardCode: header.CardCode,
            cardName: header.CardName,
            currency: header.DocCur ?? "KRW",
            docDate: header.DocDate,
            docDueDate: header.DocDueDate,
            bplId: String(header.BPLId),
            slpCode: header.SlpCode != null && header.SlpCode >= 0 ? String(header.SlpCode) : "",
            numAtCard: header.NumAtCard ?? "",
            paymentGroup: header.GroupNum != null && header.GroupNum > 0 ? String(header.GroupNum) : "",
            journalMemo: header.JrnlMemo ?? "",
            docNum: String(header.DocNum),
            comments: header.Comments ?? "",
            headerUdf: headerUdfInit,
            lines: lines.map(
              (l): OrderLineValue => ({
                key: `e${l.LineNum}`,
                itemCode: l.ItemCode,
                itemName: l.Dscription ?? l.ItemCode,
                quantity: String(l.Quantity ?? ""),
                price: l.Price != null ? String(l.Price) : "",
                vatGroup: l.VatGroup ?? "",
                shipDate: l.ShipDate ?? "",
                whsCode: l.WhsCode ?? "",
                costingCode: l.OcrCode ?? "",
                lineNum: l.LineNum,
                udf: Object.fromEntries(
                  lineUdfDefs.map((u) => [u.column, l[u.column] != null ? String(l[u.column]) : ""]),
                ),
              }),
            ),
          }}
        />
      ) : null}
    </div>
  );
}

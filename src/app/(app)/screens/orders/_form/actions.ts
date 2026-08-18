"use server";

/**
 * 판매주문 저장/취소 서버 액션 — 생성·수정·취소 오케스트레이션.
 * 쓰기는 SL 경유만(documents.ts). 상태 가드(취소/마감 문서 차단)는 여기서 HANA 읽기로 선검증.
 * 함정 회피: 비멱등 POST 재시도 금지(client), 취소 전 상태검증.
 */
import { createSalesOrder, updateSalesOrder, cancelSalesOrder } from "@/lib/sl/documents";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db/hana";
import type { SaveOrderPayload, SaveOrderResult, CancelOrderResult } from "./types";

type OrderStatus = { CANCELED: string; DocStatus: string };

async function getOrderStatus(docEntry: number): Promise<OrderStatus | null> {
  const rows = await query<OrderStatus>(
    `SELECT "CANCELED", "DocStatus" FROM "ORDR" WHERE "DocEntry" = ?`,
    [docEntry],
  );
  return rows[0] ?? null;
}

/** 수정·취소 가능 여부 검증 — 불가 사유 문자열 반환(가능하면 null) */
function editBlockReason(st: OrderStatus | null): string | null {
  if (!st) return "문서를 찾을 수 없습니다.";
  if (st.CANCELED === "Y") return "이미 취소된 문서입니다.";
  if (st.DocStatus === "C") return "닫힌(마감) 문서는 수정·취소할 수 없습니다.";
  return null;
}

export async function saveOrder(p: SaveOrderPayload): Promise<SaveOrderResult> {
  if (!(await getSession())) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };

  const lines = p.lines.filter((l) => l.itemCode && l.quantity > 0);
  if (!p.cardCode) return { ok: false, error: "거래처를 선택하세요." };
  if (!p.docDueDate) return { ok: false, error: "납기일을 입력하세요." };
  if (!p.bplId) return { ok: false, error: "지점을 선택하세요." };
  if (lines.length === 0) return { ok: false, error: "유효한 주문 라인(품목+수량)이 없습니다." };

  try {
    if (p.docEntry != null) {
      // 수정 — 상태 가드 후 PATCH(전체 라인 교체)
      const reason = editBlockReason(await getOrderStatus(p.docEntry));
      if (reason) return { ok: false, error: reason };
      await updateSalesOrder({
        DocEntry: p.docEntry,
        DocDueDate: p.docDueDate,
        NumAtCard: p.numAtCard ?? "",
        PaymentGroupCode: p.paymentGroup,
        JournalMemo: p.journalMemo ?? "",
        comments: p.comments || undefined,
        udf: p.udf,
        lines: lines.map((l) => ({
          ItemCode: l.itemCode,
          Quantity: l.quantity,
          Price: l.price,
          VatGroup: l.vatGroup,
          ShipDate: l.shipDate,
          WarehouseCode: l.whsCode,
          CostingCode: l.costingCode,
          LineNum: l.lineNum,
          udf: l.udf,
        })),
      });
      return { ok: true, docEntry: p.docEntry };
    }

    // 생성
    const res = await createSalesOrder({
      CardCode: p.cardCode,
      CardName: p.cardName || undefined,
      DocCurrency: p.currency || undefined,
      DocDate: p.docDate || undefined,
      DocDueDate: p.docDueDate,
      BPLId: p.bplId,
      SalesPersonCode: p.slpCode,
      NumAtCard: p.numAtCard || undefined,
      PaymentGroupCode: p.paymentGroup,
      JournalMemo: p.journalMemo || undefined,
      comments: p.comments || undefined,
      udf: p.udf,
      lines: lines.map((l) => ({
        ItemCode: l.itemCode,
        Quantity: l.quantity,
        Price: l.price,
        VatGroup: l.vatGroup,
        ShipDate: l.shipDate,
        WarehouseCode: l.whsCode,
        CostingCode: l.costingCode,
        udf: l.udf,
      })),
    });
    return { ok: true, docEntry: res.DocEntry, docNum: res.DocNum };
  } catch (e) {
    // SL 업무규칙 에러(전기기간·코스트센터·후속문서 등)를 사람이 읽게 그대로 노출
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelOrder(docEntry: number): Promise<CancelOrderResult> {
  if (!(await getSession())) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };
  try {
    const reason = editBlockReason(await getOrderStatus(docEntry));
    if (reason) return { ok: false, error: reason };
    await cancelSalesOrder(docEntry);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

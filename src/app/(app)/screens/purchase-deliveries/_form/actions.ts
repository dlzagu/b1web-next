"use server";

/**
 * 구매입고(구매오더→입고 문서연결) 서버 액션 — 범용 draw 코어 위임(설정=PURCHASE_DELIVERY_DRAW).
 * fetch(가져오기)·save(생성)는 DrawDocForm 이, cancelPurchaseDelivery 는 PurchaseDeliveryActions 가 호출.
 */
import { getSession } from "@/lib/auth/session";
import { listOpenBaseDocs, loadBaseOpenLines, createDraw, cancelDraw } from "../../_shared/draw/core";
import { PURCHASE_DELIVERY_DRAW } from "./config";
import type { OpenBaseDoc, OpenBaseLine, SavePayload, SaveResult, CancelResult } from "../../_shared/draw/types";

/** 가져오기 모달 — 미입고 구매오더 목록 */
export async function fetchOpenBase(cardCode?: string): Promise<OpenBaseDoc[]> {
  if (!(await getSession())) return [];
  try {
    return await listOpenBaseDocs(PURCHASE_DELIVERY_DRAW, cardCode || undefined);
  } catch {
    return [];
  }
}

/** 가져오기 — 선택한 구매오더의 미입고 라인 */
export async function fetchBaseLines(
  docEntry: number,
): Promise<{ cardCode: string; cardName: string; docCur: string | null; lines: OpenBaseLine[] } | null> {
  if (!(await getSession())) return null;
  try {
    const { header, lines } = await loadBaseOpenLines(PURCHASE_DELIVERY_DRAW, docEntry);
    if (!header) return null;
    return { cardCode: header.cardCode, cardName: header.cardName, docCur: header.docCur, lines };
  } catch {
    return null;
  }
}

/** 구매입고 생성 (구매오더 → 입고 문서연결). */
export async function saveDraw(p: SavePayload): Promise<SaveResult> {
  return createDraw(PURCHASE_DELIVERY_DRAW, p);
}

/** 구매입고 취소 — 상태가드 후 PurchaseDeliveryNotes(id)/Cancel. */
export async function cancelPurchaseDelivery(docEntry: number): Promise<CancelResult> {
  return cancelDraw(PURCHASE_DELIVERY_DRAW, docEntry);
}

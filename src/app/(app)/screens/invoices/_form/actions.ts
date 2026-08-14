"use server";

/**
 * 매출 세금계산서(납품→송장 문서연결) 서버 액션 — 범용 draw 코어 위임(설정=INVOICE_DRAW).
 * fetch(가져오기)·save(생성)는 DrawDocForm 이, cancelInvoice 는 InvoiceActions 가 호출.
 */
import { getSession } from "@/lib/auth/session";
import { listOpenBaseDocs, loadBaseOpenLines, createDraw, cancelDraw } from "../../_shared/draw/core";
import { INVOICE_DRAW } from "./config";
import type { OpenBaseDoc, OpenBaseLine, SavePayload, SaveResult, CancelResult } from "../../_shared/draw/types";

/** 가져오기 모달 — 미청구 납품 목록 */
export async function fetchOpenBase(cardCode?: string): Promise<OpenBaseDoc[]> {
  if (!(await getSession())) return [];
  try {
    return await listOpenBaseDocs(INVOICE_DRAW, cardCode || undefined);
  } catch {
    return [];
  }
}

/** 가져오기 — 선택한 납품의 미청구 라인 */
export async function fetchBaseLines(
  docEntry: number,
): Promise<{ cardCode: string; cardName: string; docCur: string | null; lines: OpenBaseLine[] } | null> {
  if (!(await getSession())) return null;
  try {
    const { header, lines } = await loadBaseOpenLines(INVOICE_DRAW, docEntry);
    if (!header) return null;
    return { cardCode: header.cardCode, cardName: header.cardName, docCur: header.docCur, lines };
  } catch {
    return null;
  }
}

/** 매출송장 생성 (납품 → 송장 문서연결). */
export async function saveDraw(p: SavePayload): Promise<SaveResult> {
  return createDraw(INVOICE_DRAW, p);
}

/** 매출송장 취소 — 상태가드 후 Invoices(id)/Cancel. */
export async function cancelInvoice(docEntry: number): Promise<CancelResult> {
  return cancelDraw(INVOICE_DRAW, docEntry);
}

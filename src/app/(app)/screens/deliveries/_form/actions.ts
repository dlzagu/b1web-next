"use server";

/**
 * 납품(오더→납품 문서연결) 서버 액션 — 범용 draw 코어 위임(설정=DELIVERY_DRAW).
 * fetch(가져오기)·save(생성)는 DrawDocForm 이, cancelDelivery 는 DeliveryActions 가 호출.
 */
import { getSession } from "@/lib/auth/session";
import { listOpenBaseDocs, loadBaseOpenLines, createDraw, cancelDraw } from "../../_shared/draw/core";
import { DELIVERY_DRAW } from "./config";
import type { OpenBaseDoc, OpenBaseLine, SavePayload, SaveResult, CancelResult } from "../../_shared/draw/types";

/** 가져오기 모달 — 미납 오더 목록 */
export async function fetchOpenBase(cardCode?: string): Promise<OpenBaseDoc[]> {
  if (!(await getSession())) return [];
  try {
    return await listOpenBaseDocs(DELIVERY_DRAW, cardCode || undefined);
  } catch {
    return [];
  }
}

/** 가져오기 — 선택한 오더의 미납 라인 */
export async function fetchBaseLines(
  docEntry: number,
): Promise<{ cardCode: string; cardName: string; docCur: string | null; lines: OpenBaseLine[] } | null> {
  if (!(await getSession())) return null;
  try {
    const { header, lines } = await loadBaseOpenLines(DELIVERY_DRAW, docEntry);
    if (!header) return null;
    return { cardCode: header.cardCode, cardName: header.cardName, docCur: header.docCur, lines };
  } catch {
    return null;
  }
}

/** 납품 생성 (오더 → 납품 문서연결). */
export async function saveDraw(p: SavePayload): Promise<SaveResult> {
  return createDraw(DELIVERY_DRAW, p);
}

/** 납품 취소 — 상태가드 후 DeliveryNotes(id)/Cancel. */
export async function cancelDelivery(docEntry: number): Promise<CancelResult> {
  return cancelDraw(DELIVERY_DRAW, docEntry);
}

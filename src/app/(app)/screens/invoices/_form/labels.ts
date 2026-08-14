/** 매출 세금계산서 생성 폼 라벨 (client 공용 — server-only 아님). */
import type { DrawLabels } from "../../_shared/draw/types";

export const INVOICE_LABELS: DrawLabels = {
  newTitle: "매출 세금계산서 신규 (납품 연결)",
  saveLabel: "저장 (송장 생성)",
  failLabel: "송장 생성",
  listHref: "/screens/invoices",
  note: "※ 송장은 매출을 계상합니다(전기일 2026-05). 납품에서 미청구분만 가져와 SL 문서연결(BaseType 15)로 생성됩니다.",
  importLabel: "가져오기 (납품)",
  lineCardTitle: "송장 라인 (납품 미청구분)",
  emptyLines: "납품을 선택하면 미청구 라인이 여기 채워집니다.",
  baseQtyCol: "납품수량",
  openQtyCol: "미청구수량",
  qtyCol: "청구수량",
  baseRefCol: "납품",
  qtyTotalLabel: "청구수량",
  modalTitle: "납품 가져오기",
  baseNumCol: "납품번호",
  openTotalCol: "미청구금액",
  emptyImport: "미청구 납품이 없습니다.",
};

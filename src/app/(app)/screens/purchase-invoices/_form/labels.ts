/** 매입 세금계산서 생성 폼 라벨 (client 공용 — server-only 아님). */
import type { DrawLabels } from "../../_shared/draw/types";

export const PURCHASE_INVOICE_LABELS: DrawLabels = {
  newTitle: "매입 세금계산서 신규 (구매입고 연결)",
  saveLabel: "저장 (매입송장 생성)",
  failLabel: "매입송장 생성",
  listHref: "/screens/purchase-invoices",
  note: "※ 매입송장은 미지급금을 계상합니다(전기일 2026-05). 구매입고에서 미청구분만 가져와 SL 문서연결(BaseType 20)로 생성됩니다.",
  importLabel: "가져오기 (구매입고)",
  lineCardTitle: "매입송장 라인 (구매입고 미청구분)",
  emptyLines: "구매입고를 선택하면 미청구 라인이 여기 채워집니다.",
  baseQtyCol: "입고수량",
  openQtyCol: "미청구수량",
  qtyCol: "청구수량",
  baseRefCol: "구매입고",
  qtyTotalLabel: "청구수량",
  modalTitle: "구매입고 가져오기",
  baseNumCol: "입고번호",
  openTotalCol: "미청구금액",
  emptyImport: "미청구 구매입고가 없습니다.",
};

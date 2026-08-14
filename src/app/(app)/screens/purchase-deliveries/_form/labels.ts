/** 구매입고 생성 폼 라벨 (client 공용 — server-only 아님). */
import type { DrawLabels } from "../../_shared/draw/types";

export const PURCHASE_DELIVERY_LABELS: DrawLabels = {
  newTitle: "구매입고 신규 (구매오더 연결)",
  saveLabel: "저장 (입고 생성)",
  failLabel: "입고 생성",
  listHref: "/screens/purchase-deliveries",
  note: "※ 구매입고는 재고를 증가시킵니다(전기일 2026-05). 구매오더에서 미입고분만 가져와 SL 문서연결(BaseType 22)로 생성됩니다.",
  importLabel: "가져오기 (구매오더)",
  lineCardTitle: "입고 라인 (구매오더 미입고분)",
  emptyLines: "구매오더를 선택하면 미입고 라인이 여기 채워집니다.",
  baseQtyCol: "주문수량",
  openQtyCol: "미입고수량",
  qtyCol: "입고수량",
  baseRefCol: "구매오더",
  qtyTotalLabel: "입고수량",
  modalTitle: "구매오더 가져오기",
  baseNumCol: "오더번호",
  openTotalCol: "미입고금액",
  emptyImport: "미입고 구매오더가 없습니다.",
};

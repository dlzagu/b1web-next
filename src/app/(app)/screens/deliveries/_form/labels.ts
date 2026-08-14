/** 납품 생성 폼 라벨 (client 공용 — server-only 아님). */
import type { DrawLabels } from "../../_shared/draw/types";

export const DELIVERY_LABELS: DrawLabels = {
  newTitle: "납품 신규 (오더 연결)",
  saveLabel: "저장 (납품 생성)",
  failLabel: "납품 생성",
  listHref: "/screens/deliveries",
  note: "※ 납품은 재고를 차감합니다(전기일 2026-05). 오더에서 미납분만 가져와 SL 문서연결(BaseType 17)로 생성됩니다.",
  importLabel: "가져오기 (오더)",
  lineCardTitle: "납품 라인 (오더 미납분)",
  emptyLines: "판매오더를 선택하면 미납 라인이 여기 채워집니다.",
  baseQtyCol: "주문수량",
  openQtyCol: "미납수량",
  qtyCol: "납품수량",
  baseRefCol: "오더",
  qtyTotalLabel: "납품수량",
  modalTitle: "판매오더 가져오기",
  baseNumCol: "오더번호",
  openTotalCol: "미납금액",
  emptyImport: "미납 오더가 없습니다.",
};

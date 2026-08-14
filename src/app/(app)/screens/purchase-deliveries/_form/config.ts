import "server-only";

/** 구매입고(구매오더→입고) 문서연결 서버 설정. (화면 라벨은 client 공용 labels.ts) */
import { OBJ } from "@/lib/sl/documents";
import type { DrawConfig } from "../../_shared/draw/core";

/** 서버측 문서연결 설정 (구매오더 → 구매입고, BaseType 22) */
export const PURCHASE_DELIVERY_DRAW: DrawConfig = {
  entity: "PurchaseDeliveryNotes",
  baseType: OBJ.PurchaseOrder, // 22
  baseHeaderTable: "OPOR",
  baseLineTable: "POR1",
  targetStatusTable: "OPDN",
};

import "server-only";

/** 매입 세금계산서(구매입고→매입송장) 문서연결 서버 설정. (화면 라벨은 client 공용 labels.ts) */
import { OBJ } from "@/lib/sl/documents";
import type { DrawConfig } from "../../_shared/draw/core";

/** 서버측 문서연결 설정 (구매입고 → 매입송장, BaseType 20) */
export const PURCHASE_INVOICE_DRAW: DrawConfig = {
  entity: "PurchaseInvoices",
  baseType: OBJ.GoodsReceiptPO, // 20
  baseHeaderTable: "OPDN",
  baseLineTable: "PDN1",
  targetStatusTable: "OPCH",
};

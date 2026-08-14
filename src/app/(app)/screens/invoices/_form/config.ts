import "server-only";

/** 매출 세금계산서(납품→송장) 문서연결 서버 설정. (화면 라벨은 client 공용 labels.ts) */
import { OBJ } from "@/lib/sl/documents";
import type { DrawConfig } from "../../_shared/draw/core";

/** 서버측 문서연결 설정 (납품 → 매출송장, BaseType 15) */
export const INVOICE_DRAW: DrawConfig = {
  entity: "Invoices",
  baseType: OBJ.Delivery, // 15
  baseHeaderTable: "ODLN",
  baseLineTable: "DLN1",
  targetStatusTable: "OINV",
};

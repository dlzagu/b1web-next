import "server-only";

/** 납품(오더→납품) 문서연결 서버 설정. (화면 라벨은 client 공용 labels.ts) */
import { OBJ } from "@/lib/sl/documents";
import type { DrawConfig } from "../../_shared/draw/core";

/** 서버측 문서연결 설정 (오더 → 납품, BaseType 17) */
export const DELIVERY_DRAW: DrawConfig = {
  entity: "DeliveryNotes",
  baseType: OBJ.SalesOrder, // 17
  baseHeaderTable: "ORDR",
  baseLineTable: "RDR1",
  targetStatusTable: "ODLN",
};

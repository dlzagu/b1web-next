"use client";

/**
 * 구매입고 생성 폼 — 범용 DrawDocForm 에 구매입고 라벨 + 서버액션 주입(구매오더→입고).
 */
import DrawDocForm from "../../_shared/draw/DrawDocForm";
import { fetchOpenBase, fetchBaseLines, saveDraw } from "./actions";
import { PURCHASE_DELIVERY_LABELS } from "./labels";
import type { DrawInitial } from "../../_shared/draw/types";
import type { UdfDefC } from "../../_shared/docFormLayout";

export default function PurchaseDeliveryForm({
  initial,
  storageNs,
  uid,
  headerUdfs,
  lineUdfs,
}: {
  initial: DrawInitial;
  storageNs: string;
  uid: string;
  headerUdfs: UdfDefC[];
  lineUdfs: UdfDefC[];
}) {
  return (
    <DrawDocForm
      initial={initial}
      labels={PURCHASE_DELIVERY_LABELS}
      actions={{ fetchOpenBase, fetchBaseLines, save: saveDraw }}
      storageNs={storageNs}
      uid={uid}
      headerUdfs={headerUdfs}
      lineUdfs={lineUdfs}
    />
  );
}

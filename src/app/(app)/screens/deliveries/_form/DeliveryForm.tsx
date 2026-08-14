"use client";

/**
 * 납품 생성 폼 — 범용 DrawDocForm 에 납품 라벨 + 서버액션 주입(오더→납품).
 */
import DrawDocForm from "../../_shared/draw/DrawDocForm";
import { fetchOpenBase, fetchBaseLines, saveDraw } from "./actions";
import { DELIVERY_LABELS } from "./labels";
import type { DrawInitial } from "../../_shared/draw/types";
import type { UdfDefC } from "../../_shared/docFormLayout";

export default function DeliveryForm({
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
      labels={DELIVERY_LABELS}
      actions={{ fetchOpenBase, fetchBaseLines, save: saveDraw }}
      storageNs={storageNs}
      uid={uid}
      headerUdfs={headerUdfs}
      lineUdfs={lineUdfs}
    />
  );
}

/**
 * 구매입고 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). OPDN(헤더)+PDN1(라인).
 * 공통 DocBaseDetail 로 표/라벨/원천·후속링크/액션 주입(원천 구매오더 + [매입송장생성][취소]).
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { PurchaseDeliveryActions } from "./PurchaseDeliveryActions";

export const dynamic = "force-dynamic";

export default async function PurchaseDeliveryDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "OPDN",
        lineTable: "PDN1",
        title: "구매입고",
        storageNs: "purchase-deliveries",
        partnerLabel: "매입처",
        personLabel: "구매담당",
        refLabel: "공급처 참조번호",
        docDateLabel: "전기일",
        dueLabel: "만기일",
        baseLink: { baseType: 22, baseTable: "OPOR", baseHref: "/screens/purchase-orders", label: "원천 구매오더" },
        targetLinks: [
          { thisObjType: 20, childLineTable: "PCH1", childHeaderTable: "OPCH", childHref: "/screens/purchase-invoices", label: "후속 매입송장" },
        ],
        renderActions: ({ docEntry: de, editable }) => <PurchaseDeliveryActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

/**
 * 구매주문 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). OPOR(헤더)+POR1(라인).
 * 공통 DocBaseDetail 로 표/라벨/후속링크/액션 주입(원천문서 없음 — 흐름 시작점). [수정][취소][구매입고 생성].
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { PurchaseOrderActions } from "./PurchaseOrderActions";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "OPOR",
        lineTable: "POR1",
        title: "구매주문",
        storageNs: "purchase-orders",
        partnerLabel: "매입처",
        personLabel: "구매담당",
        refLabel: "공급처 참조번호",
        docDateLabel: "전기일",
        dueLabel: "납기일",
        shipDate: true, // 라인 납품예정일(POR1.ShipDate) 컬럼 노출 — 폼이 수집·저장하므로 상세도 표시(판매오더 정본과 일치)
        targetLinks: [
          { thisObjType: 22, childLineTable: "PDN1", childHeaderTable: "OPDN", childHref: "/screens/purchase-deliveries", label: "후속 구매입고" },
        ],
        renderActions: ({ docEntry: de, editable }) => <PurchaseOrderActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

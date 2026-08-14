/**
 * 납품 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). 원천 판매오더 + 후속 매출송장 링크 + [송장생성][취소].
 * ODLN(헤더)+DLN1(라인). 공통 DocBaseDetail 로 표/라벨/원천·후속링크/액션만 주입.
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { DeliveryActions } from "./DeliveryActions";

export const dynamic = "force-dynamic";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "ODLN",
        lineTable: "DLN1",
        title: "납품",
        storageNs: "deliveries",
        partnerLabel: "거래처",
        personLabel: "영업사원",
        refLabel: "고객 참조번호",
        docDateLabel: "전기일",
        dueLabel: "납기일",
        baseLink: { baseType: 17, baseTable: "ORDR", baseHref: "/screens/orders", label: "원천 판매오더" },
        targetLinks: [
          { thisObjType: 15, childLineTable: "INV1", childHeaderTable: "OINV", childHref: "/screens/invoices", label: "후속 매출송장" },
        ],
        renderActions: ({ docEntry: de, editable }) => <DeliveryActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

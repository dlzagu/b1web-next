/**
 * 판매오더 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). 후속 납품 링크 + [수정][취소][납품생성].
 * ORDR(헤더)+RDR1(라인). 공통 DocBaseDetail 로 표/라벨/후속링크/액션만 주입(원천 없음 — 흐름 시작점).
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { OrderActions } from "./OrderActions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "ORDR",
        lineTable: "RDR1",
        title: "판매오더",
        storageNs: "orders",
        partnerLabel: "거래처",
        personLabel: "영업사원",
        refLabel: "고객 참조번호",
        docDateLabel: "주문일자",
        dueLabel: "납품예정일자",
        shipDate: true,
        targetLinks: [
          { thisObjType: 17, childLineTable: "DLN1", childHeaderTable: "ODLN", childHref: "/screens/deliveries", label: "후속 납품" },
        ],
        renderActions: ({ docEntry: de, editable }) => <OrderActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

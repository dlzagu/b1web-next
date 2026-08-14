/**
 * 매출 세금계산서 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). 원천 납품 링크 + [취소].
 * OINV(헤더)+INV1(라인). 공통 DocBaseDetail 로 표/라벨/원천링크/액션만 주입.
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "OINV",
        lineTable: "INV1",
        title: "매출 세금계산서",
        storageNs: "invoices",
        partnerLabel: "거래처",
        personLabel: "영업사원",
        refLabel: "고객 참조번호",
        docDateLabel: "전기일",
        dueLabel: "만기일",
        baseLink: { baseType: 15, baseTable: "ODLN", baseHref: "/screens/deliveries", label: "원천 납품" },
        renderActions: ({ docEntry: de, editable }) => <InvoiceActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

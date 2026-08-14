/**
 * 매입 세금계산서 상세 — DocBase+UDF(헤더 필드선택·라인 컬럼선택). OPCH(헤더)+PCH1(라인).
 * 공통 DocBaseDetail 로 표/라벨/원천링크/액션 주입(원천 구매입고 + [취소]).
 */
import DocBaseDetail from "../../_shared/DocBaseDetail";
import { PurchaseInvoiceActions } from "./PurchaseInvoiceActions";

export const dynamic = "force-dynamic";

export default async function PurchaseInvoiceDetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  return (
    <DocBaseDetail
      docEntry={docEntry}
      kind={{
        headerTable: "OPCH",
        lineTable: "PCH1",
        title: "매입 세금계산서",
        storageNs: "purchase-invoices",
        partnerLabel: "매입처",
        personLabel: "구매담당",
        refLabel: "공급처 참조번호",
        docDateLabel: "전기일",
        dueLabel: "만기일",
        baseLink: { baseType: 20, baseTable: "OPDN", baseHref: "/screens/purchase-deliveries", label: "원천 구매입고" },
        renderActions: ({ docEntry: de, editable }) => <PurchaseInvoiceActions docEntry={de} editable={editable} />,
      }}
    />
  );
}

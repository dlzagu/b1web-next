/**
 * DocLineListView — 라인별 보기 공통 서버 컴포넌트 (문서×라인 조인). 판매·구매 6종 목록 공유.
 * 헤더+라인 조인 SELECT → 라인 1건씩 그리드(각 행에 문서번호 부착). 행 클릭 = 문서 상세.
 * (rules.md [★DRY-공통함수화] / [★공통조회프레임워크])
 */
import { DataGrid } from "@/components/erp";
import { query } from "@/lib/db/hana";
import { SALES_DOC_LINE_SELECT_COLS, salesDocLineColumns, lineListFooter, type DocLineListRow } from "./salesDocList";

const IDENT = /^[A-Za-z0-9_]+$/;

export default async function DocLineListView({
  headerTable,
  lineTable,
  whereSql,
  params,
  storageNs,
  rowHrefBase,
  partnerLabel = "거래처",
  uid,
  max = 300,
}: {
  headerTable: string;
  lineTable: string;
  whereSql: string;
  params: (string | number)[];
  /** 컬럼 저장키 네임스페이스 (예: "orders" → b1w:cols:orders-line) */
  storageNs: string;
  /** 행 클릭 시 이동할 문서 상세 경로 접두 ("/screens/orders") */
  rowHrefBase: string;
  partnerLabel?: string;
  uid: string;
  max?: number;
}) {
  if (!IDENT.test(headerTable) || !IDENT.test(lineTable)) {
    return <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">잘못된 대상 테이블</div>;
  }
  const columns = salesDocLineColumns<DocLineListRow>(partnerLabel);
  let rows: DocLineListRow[] = [];
  let error: string | null = null;
  try {
    rows = await query<DocLineListRow>(
      `SELECT TOP ${max} ${SALES_DOC_LINE_SELECT_COLS}
       FROM "${headerTable}" o
       JOIN "${lineTable}" l ON l."DocEntry" = o."DocEntry"
       LEFT JOIN "OSLP" s ON s."SlpCode" = o."SlpCode"
       LEFT JOIN "OWHS" w ON w."WhsCode" = l."WhsCode"
       ${whereSql}
       ORDER BY o."DocDate" DESC, o."DocNum" DESC, l."LineNum"`,
      params,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>;
  }
  return (
    <>
      <p className="mb-2 text-sm text-muted">
        {rows.length.toLocaleString()}행{rows.length >= max ? ` (상위 ${max}행만 표시)` : ""}
      </p>
      <DataGrid<DocLineListRow>
        columns={columns}
        rows={rows}
        getRowKey={(r) => `${r.DocEntry}-${r.LineNum}`}
        rowHref={(r) => `${rowHrefBase}/${r.DocEntry}`}
        emptyText="조건에 맞는 라인이 없습니다."
        storageKey={`b1w:cols:${storageNs}-line:${uid}`}
        footer={lineListFooter(rows)}
      />
    </>
  );
}

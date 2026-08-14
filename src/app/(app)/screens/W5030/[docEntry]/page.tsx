/**
 * 재고이전요청 상세 — 목록(W5030) 행 클릭 시 드릴다운.
 * OWTQ(헤더) + WTQ1(라인) 직접 SELECT. orders/[docEntry] 정본 구조 복제.
 * (편집/저장은 향후 Service Layer로 확장 — 현재는 읽기 전용 상세)
 * ※ OWTQ는 거래처(CardCode) 컬럼이 존재하지만(목록 참조), 화면 성격상 창고 이전이 핵심이라
 *   출고창고(Filler)·입고창고(ToWhsCode) 중심으로 헤더 구성 (b1_describe_table 실측: 00-RULES 폴백 없이 확정).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, DataGrid, InfoField, type Column } from "@/components/erp";
import { Badge, Card, CardHeader, CardBody, buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type TransferRequestHeader = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  CardCode: string | null;
  CardName: string | null;
  WhsCode: string | null;
  FromWhsName: string | null;
  ToWhsCode: string | null;
  ToWhsName: string | null;
  DocTotal: number;
  DocStatus: string;
  CANCELED: string;
  Comments: string | null;
  SlpCode: number | null;
  SlpName: string | null;
};

type LineRow = {
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  Quantity: number;
  unitMsr: string | null;
  Price: number;
  LineTotal: number;
  WhsCode: string | null;
  WhsName: string | null;
  LineStatus: string;
};

function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return "₩" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function ymd(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

function statusBadge(status: string, canceled: string) {
  if (canceled === "Y") return <Badge variant="danger">취소됨</Badge>;
  if (status === "C") return <Badge variant="neutral">마감</Badge>;
  return <Badge variant="info">미결</Badge>;
}

const LINE_COLUMNS: Column<LineRow>[] = [
  { key: "LineNum", header: "#", align: "right", width: "56px", render: (r) => r.LineNum + 1 },
  { key: "ItemCode", header: "품목코드", width: "150px" },
  { key: "Dscription", header: "품목명" },
  { key: "Quantity", header: "수량", align: "right", width: "100px", render: (r) => num(r.Quantity) },
  { key: "unitMsr", header: "단위", align: "center", width: "80px" },
  { key: "Price", header: "단가", align: "right", width: "130px", render: (r) => money(r.Price) },
  { key: "LineTotal", header: "금액", align: "right", width: "150px", render: (r) => money(r.LineTotal) },
  {
    key: "WhsCode",
    header: "출고 창고",
    width: "140px",
    render: (r) => (
      <span>
        <span className="text-muted">{r.WhsCode}</span> {r.WhsName ?? ""}
      </span>
    ),
    // 창고명으로 정렬
    sortValue: (r) => r.WhsName ?? r.WhsCode,
  },
  {
    key: "LineStatus",
    header: "상태",
    align: "center",
    width: "80px",
    render: (r) => (r.LineStatus === "O" ? <Badge variant="info">미결</Badge> : <Badge variant="neutral">마감</Badge>),
  },
];

export default async function W5030DetailPage({ params }: { params: Promise<{ docEntry: string }> }) {
  const { docEntry } = await params;
  const id = Number(docEntry);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let header: TransferRequestHeader | null = null;
  let lines: LineRow[] = [];
  let error: string | null = null;

  try {
    const hs = await query<TransferRequestHeader>(
      `SELECT o."DocEntry", o."DocNum", TO_VARCHAR(o."DocDate",'YYYY-MM-DD') AS "DocDate",
              TO_VARCHAR(o."DocDueDate",'YYYY-MM-DD') AS "DocDueDate", o."CardCode", o."CardName",
              o."Filler" AS "WhsCode", wf."WhsName" AS "FromWhsName",
              o."ToWhsCode", wt."WhsName" AS "ToWhsName",
              o."DocTotal", o."DocStatus", o."CANCELED", o."Comments",
              o."SlpCode", s."SlpName"
       FROM "OWTQ" o
       LEFT JOIN "OSLP" s ON s."SlpCode" = o."SlpCode"
       LEFT JOIN "OWHS" wf ON wf."WhsCode" = o."Filler"
       LEFT JOIN "OWHS" wt ON wt."WhsCode" = o."ToWhsCode"
       WHERE o."DocEntry" = ?`,
      [id],
    );
    header = hs[0] ?? null;
    if (header) {
      lines = await query<LineRow>(
        `SELECT l."LineNum", l."ItemCode", l."Dscription", l."Quantity", l."unitMsr", l."Price",
                l."LineTotal", l."WhsCode", w."WhsName", l."LineStatus"
         FROM "WTQ1" l LEFT JOIN "OWHS" w ON w."WhsCode" = l."WhsCode"
         WHERE l."DocEntry" = ? ORDER BY l."LineNum"`,
        [id],
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!error && !header) notFound();

  const lineSum = lines.reduce((acc, r) => acc + Number(r.LineTotal ?? 0), 0);

  return (
    <div>
      <div className="mb-4">
        <Link href="/screens/W5030" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← 목록
        </Link>
      </div>

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>
      ) : header ? (
        <>
          <PageHeader
            title={`재고이전요청 #${header.DocNum}`}
            description={`OWTQ · DocEntry ${header.DocEntry}`}
            actions={statusBadge(header.DocStatus, header.CANCELED)}
          />

          <Card className="mb-5">
            <CardHeader title="문서 정보" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                <InfoField label="거래처">
                  <span className="text-muted">{header.CardCode}</span> {header.CardName}
                </InfoField>
                <InfoField label="영업사원">{header.SlpName ?? (header.SlpCode && header.SlpCode !== -1 ? header.SlpCode : "-")}</InfoField>
                <InfoField label="전기일">{ymd(header.DocDate)}</InfoField>
                <InfoField label="납기일">{ymd(header.DocDueDate)}</InfoField>
                <InfoField label="출고 창고">
                  <span className="text-muted">{header.WhsCode}</span> {header.FromWhsName}
                </InfoField>
                <InfoField label="입고 창고">
                  <span className="text-muted">{header.ToWhsCode}</span> {header.ToWhsName}
                </InfoField>
                <InfoField label="문서 총계">
                  <span className="font-semibold">{money(header.DocTotal)}</span>
                </InfoField>
                <InfoField label="비고">{header.Comments}</InfoField>
              </dl>
            </CardBody>
          </Card>

          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">품목 라인</h3>
            <span className="text-sm text-muted">{lines.length.toLocaleString()}행</span>
          </div>
          <DataGrid<LineRow>
            columns={LINE_COLUMNS}
            rows={lines}
            getRowKey={(r) => r.LineNum}
            emptyText="라인이 없습니다."
          />
          {lines.length > 0 && (
            <div className="mt-2 flex justify-end gap-3 rounded-card bg-surface-2 px-4 py-2.5 text-sm">
              <span className="text-muted">라인 합계</span>
              <span className="font-bold tabular-nums">{money(lineSum)}</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

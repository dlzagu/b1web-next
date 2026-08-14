/**
 * 품목 마스터 상세 — 목록(items) 행 클릭 시 드릴다운.
 * OITM(헤더, 마스터) + OITB(품목그룹명) 직접 SELECT.
 * orders 상세(문서: 헤더+라인+합계)와 달리 items 는 마스터(라인 없음) → 헤더 Card + 연관정보 패널(창고별 재고 / 최근 재고이동) 구성.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, DataGrid, InfoField, type Column } from "@/components/erp";
import { Badge, Card, CardHeader, CardBody, buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type ItemHeader = {
  ItemCode: string;
  ItemName: string | null;
  ItmsGrpCod: number | null;
  ItmsGrpNam: string | null;
  OnHand: number;
  IsCommited: number;
  OnOrder: number;
  AvgPrice: number;
  validFor: string;
  InvntItem: string;
};

type WhsRow = {
  WhsCode: string;
  WhsName: string | null;
  OnHand: number;
  IsCommited: number;
  OnOrder: number;
  MinStock: number;
};

type MoveRow = {
  DocDate: string;
  TransType: number;
  InQty: number;
  OutQty: number;
  Warehouse: string | null;
  CreatedBy: number | null;
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

// TransType → 라우팅 가능한 화면 맵 (있는 것만 링크)
const ROUTE_MAP: Record<number, string> = {
  13: "invoices",
  15: "deliveries",
  18: "purchase-invoices",
  17: "orders",
  22: "purchase-orders",
};

// TransType → 한글 라벨 (compact)
const TRANS_TYPE_LABEL: Record<number, string> = {
  13: "A/R송장",
  14: "A/R반품",
  15: "납품",
  16: "판매반품",
  17: "판매오더",
  18: "A/P송장",
  20: "입고",
  21: "구매반품",
  22: "구매오더",
  24: "입금",
  46: "지급",
  58: "재고실사",
  59: "기타입고",
  60: "기타출고",
  62: "재고재평가",
  67: "재고이전",
  162: "재고재평가",
  1250000001: "재고이전요청",
  310000001: "재고기초",
};

function transTypeLabel(t: number): string {
  return TRANS_TYPE_LABEL[t] ?? `전표(${t})`;
}

const WHS_COLUMNS: Column<WhsRow>[] = [
  {
    key: "WhsCode",
    header: "창고",
    width: "200px",
    render: (r) => (
      <span>
        <span className="text-muted">{r.WhsCode}</span> {r.WhsName ?? ""}
      </span>
    ),
    sortValue: (r) => r.WhsName ?? r.WhsCode,
  },
  { key: "OnHand", header: "보유", align: "right", render: (r) => num(r.OnHand) },
  { key: "IsCommited", header: "예약", align: "right", render: (r) => num(r.IsCommited) },
  { key: "OnOrder", header: "발주중", align: "right", render: (r) => num(r.OnOrder) },
  {
    key: "avail",
    header: "가용",
    align: "right",
    render: (r) => num(Number(r.OnHand ?? 0) - Number(r.IsCommited ?? 0)),
    sortValue: (r) => Number(r.OnHand ?? 0) - Number(r.IsCommited ?? 0),
  },
  { key: "MinStock", header: "안전재고", align: "right", render: (r) => num(r.MinStock) },
];

const MOVE_COLUMNS: Column<MoveRow>[] = [
  {
    key: "DocDate",
    header: "전기일",
    width: "110px",
    render: (r) => {
      const route = ROUTE_MAP[r.TransType];
      const label = ymd(r.DocDate);
      if (route && r.CreatedBy) {
        return (
          <Link href={`/screens/${route}/${r.CreatedBy}`} className="text-primary hover:underline">
            {label}
          </Link>
        );
      }
      return label;
    },
    sortValue: (r) => ymd(r.DocDate),
  },
  { key: "TransType", header: "문서유형", width: "120px", render: (r) => transTypeLabel(r.TransType) },
  { key: "InQty", header: "입고", align: "right", render: (r) => (r.InQty ? num(r.InQty) : "-") },
  { key: "OutQty", header: "출고", align: "right", render: (r) => (r.OutQty ? num(r.OutQty) : "-") },
  { key: "Warehouse", header: "창고", width: "100px" },
];

export default async function ItemDetailPage({ params }: { params: Promise<{ itemCode: string }> }) {
  const { itemCode } = await params;
  const code = decodeURIComponent(itemCode);
  if (!code) notFound();

  let header: ItemHeader | null = null;
  let whs: WhsRow[] = [];
  let moves: MoveRow[] = [];
  let error: string | null = null;

  try {
    const hs = await query<ItemHeader>(
      `SELECT i."ItemCode", i."ItemName", i."ItmsGrpCod", g."ItmsGrpNam",
              i."OnHand", i."IsCommited", i."OnOrder", i."AvgPrice", i."validFor", i."InvntItem"
       FROM "OITM" i LEFT JOIN "OITB" g ON g."ItmsGrpCod" = i."ItmsGrpCod"
       WHERE i."ItemCode" = ?`,
      [code],
    );
    header = hs[0] ?? null;

    if (header) {
      whs = await query<WhsRow>(
        `SELECT l."WhsCode", w."WhsName", l."OnHand", l."IsCommited", l."OnOrder", l."MinStock"
         FROM "OITW" l LEFT JOIN "OWHS" w ON w."WhsCode" = l."WhsCode"
         WHERE l."ItemCode" = ?
         ORDER BY l."WhsCode"`,
        [code],
      );

      moves = await query<MoveRow>(
        `SELECT TOP 20 TO_VARCHAR(m."DocDate",'YYYY-MM-DD') AS "DocDate", m."TransType",
                m."InQty", m."OutQty", m."Warehouse", m."CreatedBy"
         FROM "OINM" m
         WHERE m."ItemCode" = ?
         ORDER BY m."DocDate" DESC, m."DocLineNum" DESC`,
        [code],
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!error && !header) notFound();

  const whsOnHandSum = whs.reduce((acc, r) => acc + Number(r.OnHand ?? 0), 0);

  return (
    <div>
      <div className="mb-4">
        <Link href="/screens/items" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← 목록
        </Link>
      </div>

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>
      ) : header ? (
        <>
          <PageHeader
            title={header.ItemName ?? header.ItemCode}
            description={`OITM · ItemCode ${header.ItemCode}`}
            actions={header.validFor === "Y" ? <Badge variant="info">활성</Badge> : <Badge variant="neutral">비활성</Badge>}
          />

          <Card className="mb-5">
            <CardHeader title="품목 정보" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                <InfoField label="품목코드">{header.ItemCode}</InfoField>
                <InfoField label="품목명">{header.ItemName}</InfoField>
                <InfoField label="품목그룹">{header.ItmsGrpNam}</InfoField>
                <InfoField label="재고품목여부">
                  {header.InvntItem === "Y" ? <Badge variant="info">재고품목</Badge> : <Badge variant="neutral">비재고</Badge>}
                </InfoField>
                <InfoField label="총재고">{num(header.OnHand)}</InfoField>
                <InfoField label="가용">{num(Number(header.OnHand ?? 0) - Number(header.IsCommited ?? 0))}</InfoField>
                <InfoField label="예약">{num(header.IsCommited)}</InfoField>
                <InfoField label="발주중">{num(header.OnOrder)}</InfoField>
                <InfoField label="평균원가">{money(header.AvgPrice)}</InfoField>
              </dl>
            </CardBody>
          </Card>

          <div className="mb-2 mt-6 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">창고별 재고</h3>
            <span className="text-sm text-muted">{whs.length.toLocaleString()}건</span>
          </div>
          <DataGrid<WhsRow>
            columns={WHS_COLUMNS}
            rows={whs}
            getRowKey={(r) => r.WhsCode}
            emptyText="창고별 재고 정보가 없습니다."
            footer={
              whs.length > 0 ? (
                <div className="flex justify-end gap-3">
                  <span className="text-muted">총 보유 합계</span>
                  <span className="font-bold tabular-nums">{num(whsOnHandSum)}</span>
                </div>
              ) : undefined
            }
          />

          <div className="mb-2 mt-6 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">최근 재고이동</h3>
            <span className="text-sm text-muted">{moves.length.toLocaleString()}건</span>
          </div>
          <DataGrid<MoveRow>
            columns={MOVE_COLUMNS}
            rows={moves}
            getRowKey={(r, i) => i}
            emptyText="재고이동 이력이 없습니다."
          />
        </>
      ) : null}
    </div>
  );
}

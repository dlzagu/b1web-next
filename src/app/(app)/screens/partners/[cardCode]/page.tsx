/**
 * 거래처 상세 — 목록(partners) 행 클릭 시 드릴다운.
 * OCRD(마스터) 직접 SELECT. 거래처는 "문서"가 아니라 "마스터"(라인 없음)이므로
 * 품목 라인 대신 여러 개의 연관정보 패널(주소·최근 거래)을 배치한다.
 * (편집/저장은 향후 Service Layer로 확장 — 현재는 읽기 전용 상세)
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, DataGrid, InfoField, type Column } from "@/components/erp";
import { Badge, Card, CardHeader, CardBody, buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";

export const dynamic = "force-dynamic";

type PartnerHeader = {
  CardCode: string;
  CardName: string;
  CardType: string;
  GroupName: string | null;
  Phone1: string | null;
  Cellular: string | null;
  E_Mail: string | null;
  CntctPrsn: string | null;
  Currency: string | null;
  Balance: number;
  validFor: string;
};

type AddressRow = {
  AdresType: string;
  Address: string | null;
  Street: string | null;
  City: string | null;
  ZipCode: string | null;
  Country: string | null;
};

type TransactionRow = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocTotal: number;
  PaidToDate: number;
  DocStatus: string;
  CANCELED: string;
};

type OpenSummary = {
  cnt: number;
  openAmt: number;
};

const TYPE_LABEL: Record<string, string> = { C: "고객", S: "공급처", L: "리드" };
const ADDR_TYPE_LABEL: Record<string, string> = { B: "청구", S: "배송" };

function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return "₩" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function ymd(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

function typeBadge(type: string) {
  const label = TYPE_LABEL[type] ?? type;
  if (type === "C") return <Badge variant="info">{label}</Badge>;
  if (type === "S") return <Badge variant="success">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}

function activeBadge(validFor: string) {
  return validFor === "Y" ? <Badge variant="success">사용</Badge> : <Badge variant="neutral">중지</Badge>;
}

function docStatusBadge(status: string, canceled: string) {
  if (canceled === "Y") return <Badge variant="danger">취소</Badge>;
  if (status === "O") return <Badge variant="info">열림</Badge>;
  if (status === "C") return <Badge variant="neutral">닫힘</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

const ADDRESS_COLUMNS: Column<AddressRow>[] = [
  {
    key: "AdresType",
    header: "구분",
    align: "center",
    width: "80px",
    render: (r) => ADDR_TYPE_LABEL[r.AdresType] ?? r.AdresType,
  },
  { key: "Address", header: "주소명", width: "160px" },
  { key: "Street", header: "도로명" },
  { key: "City", header: "도시", width: "140px" },
  { key: "ZipCode", header: "우편번호", width: "110px" },
  { key: "Country", header: "국가", width: "90px" },
];

export default async function PartnerDetailPage({ params }: { params: Promise<{ cardCode: string }> }) {
  const { cardCode: rawCardCode } = await params;
  const cardCode = decodeURIComponent(rawCardCode);
  if (!cardCode) notFound();

  let header: PartnerHeader | null = null;
  let addresses: AddressRow[] = [];
  let transactions: TransactionRow[] = [];
  let openSummary: OpenSummary | null = null;
  let error: string | null = null;

  try {
    const hs = await query<PartnerHeader>(
      `SELECT c."CardCode", c."CardName", c."CardType", g."GroupName", c."Phone1", c."Cellular",
              c."E_Mail", c."CntctPrsn", c."Currency", c."Balance", c."validFor"
       FROM "OCRD" c LEFT JOIN "OCRG" g ON g."GroupCode" = c."GroupCode"
       WHERE c."CardCode" = ?`,
      [cardCode],
    );
    header = hs[0] ?? null;

    if (header) {
      addresses = await query<AddressRow>(
        `SELECT "AdresType", "Address", "Street", "City", "ZipCode", "Country"
         FROM "CRD1"
         WHERE "CardCode" = ?
         ORDER BY "AdresType", "Address"`,
        [cardCode],
      );

      if (header.CardType === "C") {
        transactions = await query<TransactionRow>(
          `SELECT TOP 10 "DocEntry", "DocNum", TO_VARCHAR("DocDate",'YYYY-MM-DD') AS "DocDate",
                  "DocTotal", "PaidToDate", "DocStatus", "CANCELED"
           FROM "OINV"
           WHERE "CardCode" = ?
           ORDER BY "DocDate" DESC`,
          [cardCode],
        );
        const os = await query<{ cnt: number; openAmt: number }>(
          `SELECT COUNT(*) AS "cnt", SUM("DocTotal" - "PaidToDate") AS "openAmt"
           FROM "OINV"
           WHERE "CardCode" = ? AND "DocStatus" = 'O'`,
          [cardCode],
        );
        openSummary = os[0] ?? null;
      } else if (header.CardType === "S") {
        transactions = await query<TransactionRow>(
          `SELECT TOP 10 "DocEntry", "DocNum", TO_VARCHAR("DocDate",'YYYY-MM-DD') AS "DocDate",
                  "DocTotal", "PaidToDate", "DocStatus", "CANCELED"
           FROM "OPCH"
           WHERE "CardCode" = ?
           ORDER BY "DocDate" DESC`,
          [cardCode],
        );
        const os = await query<{ cnt: number; openAmt: number }>(
          `SELECT COUNT(*) AS "cnt", SUM("DocTotal" - "PaidToDate") AS "openAmt"
           FROM "OPCH"
           WHERE "CardCode" = ? AND "DocStatus" = 'O'`,
          [cardCode],
        );
        openSummary = os[0] ?? null;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!error && !header) notFound();

  const detailBase = header?.CardType === "S" ? "/screens/purchase-invoices" : "/screens/invoices";
  const transactionColumns: Column<TransactionRow>[] = [
    {
      key: "DocNum",
      header: "문서번호",
      width: "120px",
      render: (r) => <span className="text-info">{r.DocNum}</span>,
    },
    { key: "DocDate", header: "전기일", width: "120px", render: (r) => ymd(r.DocDate) },
    { key: "DocTotal", header: "금액", align: "right", width: "140px", render: (r) => money(r.DocTotal) },
    {
      key: "Balance",
      header: "미결잔액",
      align: "right",
      width: "140px",
      render: (r) => money(Number(r.DocTotal ?? 0) - Number(r.PaidToDate ?? 0)),
      sortValue: (r) => Number(r.DocTotal ?? 0) - Number(r.PaidToDate ?? 0),
    },
    {
      key: "DocStatus",
      header: "상태",
      align: "center",
      width: "80px",
      render: (r) => docStatusBadge(r.DocStatus, r.CANCELED),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <Link href="/screens/partners" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← 목록
        </Link>
      </div>

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>
      ) : header ? (
        <>
          <PageHeader
            title={`거래처 · ${header.CardName}`}
            description={`OCRD · CardCode ${header.CardCode}`}
            actions={
              <div className="flex gap-2">
                {typeBadge(header.CardType)}
                {activeBadge(header.validFor)}
              </div>
            }
          />

          <Card className="mb-5">
            <CardHeader title="거래처 정보" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                <InfoField label="코드">{header.CardCode}</InfoField>
                <InfoField label="거래처명">{header.CardName}</InfoField>
                <InfoField label="그룹">{header.GroupName}</InfoField>
                <InfoField label="담당자">{header.CntctPrsn}</InfoField>
                <InfoField label="전화">{header.Phone1}</InfoField>
                <InfoField label="휴대폰">{header.Cellular}</InfoField>
                <InfoField label="이메일">{header.E_Mail}</InfoField>
                <InfoField label="통화">{header.Currency}</InfoField>
                <InfoField label="잔액">
                  <span className="font-semibold">{money(header.Balance)}</span>
                </InfoField>
              </dl>
            </CardBody>
          </Card>
          {openSummary && (header.CardType === "C" || header.CardType === "S") && (
            <div className="mt-3 flex gap-3 rounded-card bg-surface-2 px-4 py-2.5 text-sm">
              <span className="text-muted">{header.CardType === "C" ? "미결 매출채권" : "미결 매입채무"}</span>
              <span className="font-bold tabular-nums">{openSummary.cnt.toLocaleString()}건</span>
              <span className="font-bold tabular-nums">{money(openSummary.openAmt)}</span>
            </div>
          )}

          <div className="mb-2 mt-6 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">주소</h3>
            <span className="text-sm text-muted">{addresses.length.toLocaleString()}건</span>
          </div>
          <DataGrid<AddressRow>
            columns={ADDRESS_COLUMNS}
            rows={addresses}
            getRowKey={(r, i) => `${r.AdresType}-${r.Address ?? i}`}
            emptyText="등록된 주소가 없습니다."
          />

          {header.CardType !== "L" && (
            <>
              <div className="mb-2 mt-6 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">최근 거래</h3>
                <span className="text-sm text-muted">{transactions.length.toLocaleString()}건</span>
              </div>
              <DataGrid<TransactionRow>
                columns={transactionColumns}
                rows={transactions}
                getRowKey={(r) => r.DocEntry}
                rowHref={(r) => `${detailBase}/${r.DocEntry}`}
                emptyText="거래 내역이 없습니다."
              />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

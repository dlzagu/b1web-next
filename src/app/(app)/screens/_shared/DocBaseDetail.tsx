/**
 * DocBaseDetail — 문서 상세 범용 DocBase 컴포넌트(헤더 필드선택 + 라인 컬럼선택 + UDF).
 * 매출/매입 세금계산서·구매오더·구매입고 상세가 표/라벨/원천링크만 주입해 공유(orders/deliveries 상세와 동일 골격).
 * (rules.md [★DRY-공통함수화] / [★문서화면 필드선택+UDF])
 *  - 헤더 3열 FieldSet(표준 + UDF, 사용자 선택) / 탭(내용·상세·기타) / 하단 합계
 *  - baseLink 주입 시 상세 탭에 원천문서 링크(문서흐름). renderActions 주입 시 상단 액션(취소 등).
 * ※ 서버 전용(query·loadTableUdfs 의존) — 상세 page.tsx 에서만 import.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataGrid, InfoField, DocumentFormShell, FieldSet, type Column, type DocTab, type FieldDef } from "@/components/erp";
import { Card, CardBody, buttonVariants } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { loadTableUdfs, udfSelectFragment } from "@/lib/db/udf";
import { getSession } from "@/lib/auth/session";
import {
  ymd,
  docStatusBadge,
  docLineColumns,
  withUdfColumns,
  udfHeaderFields,
  DocTotalsFooter,
  type DocLineRow,
} from "./docDetail";

const IDENT = /^[A-Za-z0-9_]+$/;

/** 원천(상위)문서 링크 설정 — 이 문서 라인의 BaseType/BaseEntry 로 상위문서 조회 */
export type DocBaseLink = {
  /** 라인 BaseType (15=납품, 17=판매오더, 22=구매오더, 20=입고) */
  baseType: number;
  /** 원천문서 헤더 테이블 (ODLN/ORDR/OPOR/OPDN) */
  baseTable: string;
  /** 원천문서 상세 경로 접두 ("/screens/deliveries") */
  baseHref: string;
  /** 라벨 ("원천 납품") */
  label: string;
};

/** 후속(하위)문서 링크 설정 — 자식 라인이 이 문서를 BaseType/BaseEntry 로 참조하는 하위문서 조회 */
export type DocTargetLink = {
  /** 이 문서의 오브젝트타입 (자식이 BaseType 으로 참조) — 17=오더,15=납품,22=구매오더,20=입고 */
  thisObjType: number;
  /** 자식 라인 테이블 (DLN1/INV1/PDN1/PCH1) */
  childLineTable: string;
  /** 자식 헤더 테이블 (ODLN/OINV/OPDN/OPCH) */
  childHeaderTable: string;
  /** 자식 상세 경로 접두 ("/screens/invoices") */
  childHref: string;
  /** 라벨 ("후속 매출송장") */
  label: string;
};

/** 상세 대상 문서 정의(표·라벨·원천/후속 링크·액션) */
export type DocBaseKind = {
  headerTable: string; // OINV/OPOR/OPDN/OPCH
  lineTable: string; // INV1/POR1/PDN1/PCH1
  title: string; // "매출 세금계산서"
  storageNs: string; // "invoices" → 목록 /screens/invoices, 저장키 c4:hdr/cols:<ns>
  partnerLabel: string; // 거래처/매입처
  personLabel: string; // 영업사원/구매담당
  refLabel: string; // 고객 참조번호/공급처 참조번호
  docDateLabel: string; // 전기일/주문일자
  dueLabel: string; // 만기일/납기일
  shipDate?: boolean; // 라인 납품예정일 컬럼
  baseLink?: DocBaseLink; // 원천(상위)문서
  targetLinks?: DocTargetLink[]; // 후속(하위)문서 — 여러 종류 가능
  renderActions?: (ctx: { docEntry: number; editable: boolean }) => ReactNode; // 상단 액션(취소 등)
};

type DocHeader = {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  CardCode: string;
  CardName: string;
  NumAtCard: string | null;
  DocCur: string | null;
  DocRate: number | null;
  CreateDate: string | null;
  DocTotal: number;
  VatSum: number;
  DocStatus: string;
  CANCELED: string;
  Comments: string | null;
  JrnlMemo: string | null;
  GroupNum: number | null;
  PymntGroup: string | null;
  BPLId: number | null;
  BPLName: string | null;
  SlpCode: number | null;
  SlpName: string | null;
};

type LineRow = DocLineRow;
type FlowDoc = { docEntry: number; docNum: number };

export default async function DocBaseDetail({ kind, docEntry }: { kind: DocBaseKind; docEntry: string }) {
  if (!IDENT.test(kind.headerTable) || !IDENT.test(kind.lineTable)) notFound();
  const id = Number(docEntry);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await getSession(); // 필드·컬럼 선택 저장 키(사용자별)
  const [headerUdfs, lineUdfs] = await Promise.all([loadTableUdfs(kind.headerTable), loadTableUdfs(kind.lineTable)]);
  let header: (DocHeader & Record<string, unknown>) | null = null;
  let lines: (LineRow & Record<string, unknown>)[] = [];
  let baseDocs: FlowDoc[] = [];
  let targetGroups: { label: string; href: string; docs: FlowDoc[] }[] = [];
  let error: string | null = null;

  try {
    const hs = await query<DocHeader & Record<string, unknown>>(
      `SELECT o."DocEntry", o."DocNum", TO_VARCHAR(o."DocDate",'YYYY-MM-DD') AS "DocDate",
              TO_VARCHAR(o."DocDueDate",'YYYY-MM-DD') AS "DocDueDate", o."CardCode", o."CardName",
              o."NumAtCard", o."DocCur", o."DocRate", TO_VARCHAR(o."CreateDate",'YYYY-MM-DD') AS "CreateDate",
              o."DocTotal", o."VatSum", o."DocStatus", o."CANCELED",
              o."Comments", o."JrnlMemo", o."GroupNum", t."PymntGroup",
              o."BPLId", b."BPLName", o."SlpCode", s."SlpName"${udfSelectFragment(headerUdfs, "o")}
       FROM "${kind.headerTable}" o
       LEFT JOIN "OSLP" s ON s."SlpCode" = o."SlpCode"
       LEFT JOIN "OBPL" b ON b."BPLId" = o."BPLId"
       LEFT JOIN "OCTG" t ON t."GroupNum" = o."GroupNum"
       WHERE o."DocEntry" = ?`,
      [id],
    );
    header = hs[0] ?? null;
    if (header) {
      lines = await query<LineRow & Record<string, unknown>>(
        `SELECT l."LineNum", l."ItemCode", l."Dscription", l."Quantity", l."unitMsr", l."Price",
                l."DiscPrcnt", l."VatGroup", l."LineTotal", l."VatSum", l."GTotal",
                TO_VARCHAR(l."ShipDate",'YYYY-MM-DD') AS "ShipDate",
                l."WhsCode", w."WhsName", l."OcrCode", l."LineStatus"${udfSelectFragment(lineUdfs, "l")}
         FROM "${kind.lineTable}" l LEFT JOIN "OWHS" w ON w."WhsCode" = l."WhsCode"
         WHERE l."DocEntry" = ? ORDER BY l."LineNum"`,
        [id],
      );
      if (kind.baseLink && IDENT.test(kind.baseLink.baseTable)) {
        baseDocs = await query<FlowDoc>(
          `SELECT DISTINCT l."BaseEntry" AS "docEntry", b."DocNum" AS "docNum"
           FROM "${kind.lineTable}" l JOIN "${kind.baseLink.baseTable}" b ON b."DocEntry" = l."BaseEntry"
           WHERE l."DocEntry" = ? AND l."BaseType" = ${kind.baseLink.baseType} AND l."BaseEntry" > 0`,
          [id],
        );
      }
      if (kind.targetLinks?.length) {
        targetGroups = await Promise.all(
          kind.targetLinks
            .filter((t) => IDENT.test(t.childLineTable) && IDENT.test(t.childHeaderTable))
            .map(async (t) => ({
              label: t.label,
              href: t.childHref,
              docs: await query<FlowDoc>(
                `SELECT DISTINCT c."DocEntry" AS "docEntry", h."DocNum" AS "docNum"
                 FROM "${t.childLineTable}" c JOIN "${t.childHeaderTable}" h ON h."DocEntry" = c."DocEntry"
                 WHERE c."BaseType" = ${t.thisObjType} AND c."BaseEntry" = ?`,
                [id],
              ),
            })),
        );
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!error && !header) notFound();
  if (error || !header) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">조회 오류: {error}</div>
    );
  }

  const editable = header.CANCELED !== "Y" && header.DocStatus !== "C";
  const qty = lines.reduce((a, r) => a + Number(r.Quantity ?? 0), 0);
  const supply = Number(header.DocTotal ?? 0) - Number(header.VatSum ?? 0);
  const listHref = `/screens/${kind.storageNs}`;

  // 헤더 필드 (선택기 — 기본 7개, 확장 2개 + UDF 기본 숨김)
  const headerFields: FieldDef[] = [
    {
      key: "card",
      label: kind.partnerLabel,
      node: (
        <>
          <span className="text-muted">{header.CardCode}</span> {header.CardName}
        </>
      ),
    },
    {
      key: "slp",
      label: kind.personLabel,
      node: header.SlpName ?? (header.SlpCode && header.SlpCode !== -1 ? header.SlpCode : "미지정"),
    },
    { key: "docnum", label: "문서번호", node: header.DocNum },
    {
      key: "bpl",
      label: "사업장",
      node:
        header.BPLId != null ? (
          <>
            <span className="text-muted">{header.BPLId}</span> {header.BPLName ?? ""}
          </>
        ) : (
          "-"
        ),
    },
    { key: "docdate", label: kind.docDateLabel, node: ymd(header.DocDate) },
    { key: "duedate", label: kind.dueLabel, node: ymd(header.DocDueDate) },
    { key: "cur", label: "통화", node: header.DocCur },
    { key: "rate", label: "환율", node: header.DocRate ?? "-", defaultHidden: true },
    { key: "created", label: "생성일", node: ymd(header.CreateDate), defaultHidden: true },
    ...udfHeaderFields(headerUdfs, header),
  ];
  const headerNode = <FieldSet fields={headerFields} storageKey={`b1w:hdr:${kind.storageNs}:${user?.uid ?? "anon"}`} />;

  const lineColumns: Column<LineRow>[] = withUdfColumns(docLineColumns<LineRow>({ shipDate: kind.shipDate }), lineUdfs);

  const tabs: DocTab[] = [
    {
      value: "content",
      label: `내용 · ${lines.length}행`,
      content: (
        <DataGrid<LineRow>
          columns={lineColumns}
          rows={lines}
          getRowKey={(r) => r.LineNum}
          emptyText="라인이 없습니다."
          storageKey={`b1w:cols:${kind.storageNs}-detail:${user?.uid ?? "anon"}`}
        />
      ),
    },
    {
      value: "detail",
      label: "상세",
      content: (
        <Card>
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoField label={kind.refLabel}>{header.NumAtCard}</InfoField>
              <InfoField label="지불조건">
                {header.PymntGroup ?? (header.GroupNum && header.GroupNum > 0 ? header.GroupNum : "거래처 기본값")}
              </InfoField>
              {kind.baseLink && (
                <InfoField label={kind.baseLink.label}>
                  {baseDocs.length ? (
                    <span className="flex flex-wrap gap-2">
                      {baseDocs.map((d) => (
                        <Link key={d.docEntry} href={`${kind.baseLink!.baseHref}/${d.docEntry}`} className="text-info hover:underline">
                          #{d.docNum}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    "-"
                  )}
                </InfoField>
              )}
              {targetGroups.map((g) => (
                <InfoField key={g.label} label={g.label}>
                  {g.docs.length ? (
                    <span className="flex flex-wrap gap-2">
                      {g.docs.map((d) => (
                        <Link key={d.docEntry} href={`${g.href}/${d.docEntry}`} className="text-info hover:underline">
                          #{d.docNum}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    "-"
                  )}
                </InfoField>
              ))}
            </dl>
          </CardBody>
        </Card>
      ),
    },
    {
      value: "etc",
      label: "기타",
      content: (
        <Card>
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
              <InfoField label="비고">{header.Comments}</InfoField>
              <InfoField label="저널 적요">{header.JrnlMemo}</InfoField>
            </dl>
          </CardBody>
        </Card>
      ),
    },
  ];

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {kind.renderActions?.({ docEntry: header.DocEntry, editable })}
      <Link href={listHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        목록
      </Link>
    </div>
  );

  return (
    <DocumentFormShell
      title={`${kind.title} #${header.DocNum}`}
      status={docStatusBadge(header.DocStatus, header.CANCELED)}
      actions={actions}
      header={headerNode}
      tabs={tabs}
      footer={<DocTotalsFooter qty={qty} supply={supply} vat={header.VatSum} total={header.DocTotal} />}
    />
  );
}

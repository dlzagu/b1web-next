/**
 * 수주 진행 현황 (거래처 집계 → 오더라인 상세, 마스터-디테일)
 * 데이터: ORDR/RDR1 을 축으로 자식 납품(DLN1 BaseType=17)·매출송장(INV1 BaseType=15)을 롤업.
 *        상단 = 거래처 단위 3단계(주문·납품·매출) 병렬 집계, 하단 = 선택 거래처의 오더라인 진행 상세.
 *
 * 진행률·미납·미청구는 라인 미결수량에서 계산한다 — 화면 이름값을 하려면 단계 비교만으로는 부족하다.
 *
 * 🔴 취소 처리 3종 — 하나라도 빠지면 조용히 틀린다(전부 실측 재현됨):
 *   ① ORDR.CANCELED='N' 필수 — engineCancel 이 취소 문서 라인을 OpenQty=0 으로 밀어버려
 *      `Quantity-OpenQty` 가 '전량납품'으로 둔갑한다(실측 10라인·220수량).
 *   ② 자식 합산 시 자식 헤더(ODLN/OINV)의 CANCELED 필터 필수 — 취소해도 자식 라인의
 *      BaseType/BaseEntry/BaseLine 은 지워지지 않아 이중계상된다.
 *   ③ ORDR.DocStatus='C' 는 '납품완료'와 '취소'를 구분하지 못한다 → 라벨은 CANCELED 우선.
 * 🔴 오더↔송장은 1단으로 못 잇는다 — INV1 에 BaseType=17 인 행은 0건이라 반드시
 *    INV1 → DLN1 → RDR1 2단 조인. DocEntry 로 직접 이으면 무관한 문서와 조용히 붙는다.
 * 패턴: 재고 입출고 대장(DataGrid group/frozen/total) + items/[itemCode](그리드 세로 스택) 복제.
 */
import {
  PageHeader,
  SearchBar,
  DataGrid,
  type Column,
  type SearchFieldDef,
} from "@/components/erp";
import { Badge } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { getSession } from "@/lib/auth/session";
import { CHAIN_CTE, ORDER_STAGES, STAGE_CASE_SQL, STAGE_LABELS } from "@/lib/report/orderProgress";

export const dynamic = "force-dynamic";

const MAX_PARTNERS = 200;
const MAX_LINES = 300;

type PartnerRow = Record<string, unknown> & { CardCode: string; DocCur: string };
type LineRow = Record<string, unknown> & { DocEntry: number; LineNum: number };

function num(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function money(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function pct(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(1)}%`;
}
function ymd(v: unknown): string {
  return v ? String(v).slice(0, 10) : "";
}

/** 기본 기간 = 당월 1일 ~ 오늘  */
function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function defaultTo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 진행단계 배지 — 라벨·경계는 공용 계약(@/lib/report/orderProgress)에서 온다.
 * 필터 술어와 표시 CASE 를 한 곳에 묶어두지 않으면 '청구완료로 걸렀는데 부분납품 배지가 섞이는'
 * 자기모순이 생긴다(실제로 발생해 스모크 [8] 로 파티션 검증을 붙였다).
 */
function stageBadge(stage: string) {
  const variant =
    stage === STAGE_LABELS.inv
      ? "success"
      : stage === STAGE_LABELS.invPart
        ? "primary"
        : stage === STAGE_LABELS.dlv
          ? "info"
          : stage === STAGE_LABELS.part
            ? "warning"
            : "neutral";
  return <Badge variant={variant}>{stage}</Badge>;
}

export default async function OrderProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    searchFrom?: string;
    searchTo?: string;
    sCardCode?: string;
    sCardGrp?: string;
    sItemCd?: string;
    sItemGrp?: string;
    sSlpCode?: string;
    sBplId?: string;
    sStage?: string;
    sel?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await getSession();
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const sCardCode = sp.sCardCode?.trim() ?? "";
  const sCardGrp = sp.sCardGrp?.trim() ?? "";
  const sItemCd = sp.sItemCd?.trim() ?? "";
  const sItemGrp = sp.sItemGrp?.trim() ?? "";
  const sSlpCode = sp.sSlpCode?.trim() ?? "";
  const sBplId = sp.sBplId?.trim() ?? "";
  const sStage = ORDER_STAGES.some((s) => s.value === sp.sStage?.trim()) ? (sp.sStage?.trim() ?? "") : "";
  const sel = sp.sel?.trim() ?? "";

  let partners: PartnerRow[] = [];
  let lines: LineRow[] = [];
  let groups: { ItmsGrpCod: number; ItmsGrpNam: string }[] = [];
  let cardGroups: { GroupCode: number; GroupName: string }[] = [];
  let reps: { SlpCode: number; SlpName: string }[] = [];
  let plants: { BPLId: number; BPLName: string }[] = [];
  let error: string | null = null;
  let effSel = "";

  try {
    [groups, cardGroups, reps, plants] = await Promise.all([
      query<{ ItmsGrpCod: number; ItmsGrpNam: string }>(
        `SELECT "ItmsGrpCod", "ItmsGrpNam" FROM "OITB" ORDER BY "ItmsGrpNam"`,
      ),
      query<{ GroupCode: number; GroupName: string }>(
        `SELECT "GroupCode", "GroupName" FROM "OCRG" ORDER BY "GroupName"`,
      ),
      query<{ SlpCode: number; SlpName: string }>(
        `SELECT "SlpCode", "SlpName" FROM "OSLP" WHERE "SlpCode" >= 0 ORDER BY "SlpName"`,
      ),
      query<{ BPLId: number; BPLName: string }>(
        `SELECT "BPLId", "BPLName" FROM "OBPL" WHERE "Disabled" = 'N' ORDER BY "BPLId"`,
      ),
    ]);

    // 공통 WHERE — 취소 오더 제외(①)가 최우선. 값은 전부 ? 바인딩
    const where: string[] = [`COALESCE(h."CANCELED", 'N') <> 'Y'`, `h."DocDate" BETWEEN ? AND ?`];
    const baseParams: (string | number)[] = [searchFrom, searchTo];
    if (sCardCode) {
      where.push(`h."CardCode" = ?`);
      baseParams.push(sCardCode);
    }
    if (sCardGrp) {
      where.push(`h."CardCode" IN (SELECT "CardCode" FROM "OCRD" WHERE "GroupCode" = ?)`);
      baseParams.push(Number(sCardGrp));
    }
    if (sItemCd) {
      where.push(`l."ItemCode" = ?`);
      baseParams.push(sItemCd);
    }
    if (sItemGrp) {
      where.push(`l."ItemCode" IN (SELECT "ItemCode" FROM "OITM" WHERE "ItmsGrpCod" = ?)`);
      baseParams.push(Number(sItemGrp));
    }
    if (sSlpCode) {
      where.push(`h."SlpCode" = ?`);
      baseParams.push(Number(sSlpCode));
    }
    if (sBplId) {
      where.push(`h."BPLId" = ?`);
      baseParams.push(Number(sBplId));
    }
    const stageWhere = ORDER_STAGES.find((s) => s.value === sStage)?.where ?? "";
    if (stageWhere) where.push(stageWhere);

    const joins = `FROM "ORDR" h
  JOIN "RDR1" l ON l."DocEntry" = h."DocEntry"
  LEFT JOIN "DLV"  v ON v."OE" = h."DocEntry" AND v."OL" = l."LineNum"
  LEFT JOIN "INVQ" n ON n."OE" = h."DocEntry" AND n."OL" = l."LineNum"
 WHERE ${where.join(" AND ")}`;

    // ── 상단: 거래처 단위 3단계 병렬 집계 ──
    partners = await query<PartnerRow>(
      `${CHAIN_CTE}
SELECT h."CardCode", h."CardName", h."DocCur",
       COUNT(DISTINCT h."DocEntry") AS "OrdCnt",
       SUM(l."Quantity") AS "OrdQty", SUM(l."LineTotal") AS "OrdAmt",
       SUM(l."VatSum") AS "OrdVat", SUM(l."GTotal") AS "OrdTot",
       SUM(COALESCE(v."DQTY", 0)) AS "DlvQty", SUM(COALESCE(v."DAMT", 0)) AS "DlvAmt",
       SUM(COALESCE(v."DVAT", 0)) AS "DlvVat", SUM(COALESCE(v."DTOT", 0)) AS "DlvTot",
       SUM(COALESCE(n."IQTY", 0)) AS "InvQty", SUM(COALESCE(n."IAMT", 0)) AS "InvAmt",
       SUM(COALESCE(n."IVAT", 0)) AS "InvVat", SUM(COALESCE(n."ITOT", 0)) AS "InvTot",
       SUM(l."OpenQty") AS "OpenQty",
       SUM(COALESCE(v."DQTY", 0)) - SUM(COALESCE(n."IQTY", 0)) AS "UninvQty"
${joins}
 GROUP BY h."CardCode", h."CardName", h."DocCur"
 ORDER BY SUM(l."GTotal") DESC
 LIMIT ${MAX_PARTNERS}`,
      baseParams,
    );

    // 선택 거래처 정규화 — 상단 결과에 없는 sel(거래처 필터·기간·단계를 바꿔 선택이 범위 밖으로
    // 나간 경우, 링크를 직접 편집한 경우)은 무시한다. 그대로 두면 하단만 0건이 되고 헤딩엔
    // 다른 거래처명이 떠서 '데이터가 있는데 없다'로 보인다.
    effSel = partners.some((p) => p.CardCode === sel) ? sel : "";

    // ── 하단: 오더라인 진행 상세 (상단에서 고른 거래처로 좁힌다) ──
    const lineWhere = effSel ? `${joins} AND h."CardCode" = ?` : joins;
    lines = await query<LineRow>(
      `${CHAIN_CTE}
SELECT h."DocEntry", h."DocNum", h."DocDate", h."CardCode", h."CardName",
       l."LineNum", l."ItemCode", l."Dscription", l."WhsCode", l."ShipDate",
       l."Quantity" AS "OrdQty", l."LineTotal" AS "OrdAmt", l."GTotal" AS "OrdTot",
       COALESCE(v."DQTY", 0) AS "DlvQty", COALESCE(v."DTOT", 0) AS "DlvTot",
       l."OpenQty" AS "OpenQty",
       COALESCE(n."IQTY", 0) AS "InvQty", COALESCE(n."ITOT", 0) AS "InvTot",
       TO_DECIMAL(COALESCE(v."DQTY", 0) * 100.0 / l."Quantity") AS "DlvPct",
       DAYS_BETWEEN(h."DocDate", v."FIRSTDLV") AS "LeadDays",
       COALESCE(v."DQTY", 0) - COALESCE(n."IQTY", 0) AS "UninvQty",
       CASE WHEN l."OpenQty" > 0 AND l."ShipDate" < ? THEN 'Y' ELSE 'N' END AS "Overdue",
       ${STAGE_CASE_SQL} AS "Stage"
${lineWhere}
 ORDER BY h."DocDate" DESC, h."DocNum" DESC, l."LineNum"
 LIMIT ${MAX_LINES}`,
      // ⚠️ 위치 바인딩은 'SQL 텍스트에 ? 가 나오는 순서'다.
      //    납기경과 판정의 ? 는 SELECT 절에 있어 WHERE 의 기간 파라미터보다 **앞**이다.
      //    (앞뒤를 바꾸면 기간 자리에 오늘 날짜가 들어가 조용히 0건이 된다 — 실제로 밟았다)
      [defaultTo(), ...baseParams, ...(effSel ? [effSel] : [])],
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const SEARCH_FIELDS: SearchFieldDef[] = [
    { name: "searchFrom", label: "거래일(시작)", kind: "date" },
    { name: "searchTo", label: "거래일(종료)", kind: "date" },
    { name: "sCardCode", label: "거래처", kind: "cfl", cflType: "Customer" },
    { name: "sItemCd", label: "품목", kind: "cfl", cflType: "Item" },
    {
      name: "sStage",
      label: "진행단계",
      kind: "select",
      options: ORDER_STAGES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      name: "sItemGrp",
      label: "품목그룹",
      kind: "select",
      defaultShown: false,
      options: [{ value: "", label: "전체" }, ...groups.map((g) => ({ value: String(g.ItmsGrpCod), label: g.ItmsGrpNam }))],
    },
    {
      name: "sCardGrp",
      label: "거래처그룹",
      kind: "select",
      defaultShown: false,
      options: [{ value: "", label: "전체" }, ...cardGroups.map((g) => ({ value: String(g.GroupCode), label: g.GroupName }))],
    },
    {
      name: "sSlpCode",
      label: "영업사원",
      kind: "select",
      defaultShown: false,
      options: [{ value: "", label: "전체" }, ...reps.map((r) => ({ value: String(r.SlpCode), label: r.SlpName }))],
    },
    {
      name: "sBplId",
      label: "사업장",
      kind: "select",
      defaultShown: false,
      options: [{ value: "", label: "전체" }, ...plants.map((p) => ({ value: String(p.BPLId), label: p.BPLName }))],
    },
    // 선택 거래처는 화면 상태값 — 조회해도 선택이 풀리지 않게 폼에 실어 보낸다
    { name: "sel", label: "선택 거래처", kind: "hidden" },
  ];

  /** 현재 검색조건을 보존한 채 선택 거래처만 바꾸는 링크 (마스터 행 클릭 = 하단 갱신) */
  const hrefForPartner = (cardCode: string) => {
    const p = new URLSearchParams({ searchFrom, searchTo });
    if (sCardCode) p.set("sCardCode", sCardCode);
    if (sCardGrp) p.set("sCardGrp", sCardGrp);
    if (sItemCd) p.set("sItemCd", sItemCd);
    if (sItemGrp) p.set("sItemGrp", sItemGrp);
    if (sSlpCode) p.set("sSlpCode", sSlpCode);
    if (sBplId) p.set("sBplId", sBplId);
    if (sStage) p.set("sStage", sStage);
    if (cardCode) p.set("sel", cardCode);
    return `/screens/order-progress?${p.toString()}`;
  };

  // 상단 — 3단계 병렬. 순액·부가세는 기본 숨김(컬럼 선택기에서 켠다)
  const stageCols = (
    prefix: "Ord" | "Dlv" | "Inv",
    label: string,
  ): Column<PartnerRow>[] => [
    { key: `${prefix}Qty`, header: "수량", group: label, align: "right", width: "100px", total: "sum", render: (r) => num(r[`${prefix}Qty`]) },
    { key: `${prefix}Amt`, header: "금액", group: label, align: "right", width: "130px", total: "sum", defaultHidden: true, render: (r) => money(r[`${prefix}Amt`]) },
    { key: `${prefix}Vat`, header: "부가세", group: label, align: "right", width: "120px", total: "sum", defaultHidden: true, render: (r) => money(r[`${prefix}Vat`]) },
    { key: `${prefix}Tot`, header: "총액", group: label, align: "right", width: "140px", total: "sum", render: (r) => money(r[`${prefix}Tot`]) },
  ];

  const partnerColumns: Column<PartnerRow>[] = [
    { key: "CardCode", header: "거래처코드", width: "120px", frozen: true, totalLabel: "합계" },
    { key: "CardName", header: "거래처명", width: "200px", frozen: true },
    { key: "DocCur", header: "통화", align: "center", width: "80px", defaultHidden: true },
    { key: "OrdCnt", header: "오더건수", align: "right", width: "100px", total: "sum", render: (r) => num(r.OrdCnt) },
    ...stageCols("Ord", "주문"),
    ...stageCols("Dlv", "납품"),
    ...stageCols("Inv", "매출"),
    { key: "OpenQty", header: "미납수량", align: "right", width: "110px", total: "sum", render: (r) => num(r.OpenQty) },
    // 납품했지만 아직 청구 안 된 수량 — 미납(아직 안 나간 것)과 다른 축이다
    { key: "UninvQty", header: "미청구수량", align: "right", width: "120px", total: "sum", render: (r) => num(r.UninvQty) },
    {
      key: "Pct",
      header: "납품진행률",
      align: "right",
      width: "110px",
      sortValue: (r) => (Number(r.OrdQty) > 0 ? (Number(r.DlvQty) / Number(r.OrdQty)) * 100 : 0),
      render: (r) => pct(Number(r.OrdQty) > 0 ? (Number(r.DlvQty) / Number(r.OrdQty)) * 100 : 0),
    },
  ];

  const lineColumns: Column<LineRow>[] = [
    // 문서번호는 식별자 — 콤마 금지(기본 포맷터가 숫자에 toLocaleString 을 건다)
    { key: "DocNum", header: "오더번호", align: "right", width: "110px", totalLabel: "합계", render: (r) => String(r.DocNum ?? "") },
    { key: "DocDate", header: "거래일", align: "center", width: "110px", render: (r) => ymd(r.DocDate) },
    { key: "CardName", header: "거래처명", width: "180px", defaultHidden: true },
    { key: "ItemCode", header: "품목코드", width: "120px" },
    { key: "Dscription", header: "품명", width: "200px" },
    { key: "WhsCode", header: "창고", align: "center", width: "90px", defaultHidden: true },
    { key: "ShipDate", header: "납기일", align: "center", width: "110px", render: (r) => ymd(r.ShipDate) },
    { key: "OrdQty", header: "주문수량", align: "right", width: "110px", total: "sum", render: (r) => num(r.OrdQty) },
    { key: "DlvQty", header: "납품수량", align: "right", width: "110px", total: "sum", render: (r) => num(r.DlvQty) },
    { key: "OpenQty", header: "미납수량", align: "right", width: "110px", total: "sum", render: (r) => num(r.OpenQty) },
    { key: "InvQty", header: "송장수량", align: "right", width: "110px", total: "sum", render: (r) => num(r.InvQty) },
    { key: "UninvQty", header: "미청구수량", align: "right", width: "120px", total: "sum", render: (r) => num(r.UninvQty) },
    { key: "DlvPct", header: "납품진행률", align: "right", width: "110px", render: (r) => pct(r.DlvPct) },
    { key: "OrdTot", header: "주문총액", align: "right", width: "140px", total: "sum", defaultHidden: true, render: (r) => money(r.OrdTot) },
    { key: "InvTot", header: "청구총액", align: "right", width: "140px", total: "sum", defaultHidden: true, render: (r) => money(r.InvTot) },
    { key: "LeadDays", header: "리드타임", align: "right", width: "100px", defaultHidden: true, render: (r) => (r.LeadDays == null ? "" : `${num(r.LeadDays)}일`) },
    {
      key: "Stage",
      header: "진행단계",
      align: "center",
      width: "120px",
      sortValue: (r) => String(r.Stage ?? ""),
      render: (r) => stageBadge(String(r.Stage ?? "")),
    },
    {
      key: "Overdue",
      header: "납기경과",
      align: "center",
      width: "100px",
      sortValue: (r) => String(r.Overdue ?? ""),
      render: (r) => (r.Overdue === "Y" ? <Badge variant="danger">경과</Badge> : ""),
    },
  ];

  const selName = effSel ? String(partners.find((p) => p.CardCode === effSel)?.CardName ?? effSel) : "";

  return (
    <div>
      <PageHeader title="수주 진행 현황" description="ORDR→ODLN→OINV 체인 롤업 (취소 제외)" />
      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ searchFrom, searchTo, sCardCode, sCardGrp, sItemCd, sItemGrp, sSlpCode, sBplId, sStage, sel: effSel }}
        storageKey={`b1w:search:order-progress:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">진행현황 리스트 (거래처별)</h3>
            <span className="text-sm text-muted">
              {partners.length.toLocaleString()}곳
              {partners.length >= MAX_PARTNERS ? ` (상위 ${MAX_PARTNERS})` : ""}
              <span className="ml-2 text-xs text-faint">행을 클릭하면 아래 상세가 그 거래처로 바뀝니다</span>
            </span>
          </div>
          <DataGrid<PartnerRow>
            columns={partnerColumns}
            rows={partners}
            getRowKey={(r) => `${r.CardCode}:${r.DocCur}`}
            rowHref={(r) => hrefForPartner(String(r.CardCode))}
            emptyText="조건에 맞는 판매오더가 없습니다."
            storageKey={`b1w:cols:order-progress:partner:${user?.uid ?? "anon"}`}
          />

          <div className="mb-2 mt-6 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              진행 상세 (오더라인){selName ? ` — ${selName}` : ""}
            </h3>
            <span className="text-sm text-muted">
              {lines.length.toLocaleString()}건
              {lines.length >= MAX_LINES ? ` (상위 ${MAX_LINES})` : ""}
              {effSel ? (
                <a href={hrefForPartner("")} className="ml-2 text-xs text-primary hover:underline">
                  선택 해제
                </a>
              ) : (
                <span className="ml-2 text-xs text-faint">전체 거래처</span>
              )}
            </span>
          </div>
          <DataGrid<LineRow>
            columns={lineColumns}
            rows={lines}
            getRowKey={(r) => `${r.DocEntry}:${r.LineNum}`}
            rowHref={(r) => `/screens/orders/${r.DocEntry}`}
            emptyText="조건에 맞는 오더라인이 없습니다."
            storageKey={`b1w:cols:order-progress:line:${user?.uid ?? "anon"}`}
          />
        </>
      )}
    </div>
  );
}

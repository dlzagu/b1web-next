/**
 * W5060 — 재고 이동 내역 (레퍼런스 정밀복제)
 * 메뉴명은 '재고 이동 내역'이지만 실제 데이터는 재고이동 원장(OINM) 기반
 * '재고전기리스트'(CF_W5000 프로시저 내부 주석: JW_5010_01) — 재고실사(OINM 문서유형)뿐
 * 아니라 납품/입고/이전 등 모든 재고이동 트랜잭션을 포함. 레거시 실동작 그대로 보존
 * (docs/conversion/specs/W5060.json uncertainties 참조 — 역설계 확정사항).
 * 데이터소스: CALL "CF_W5000"(Gubun='J', SDT, EDT, ITEMCD, WHSCD, TYPE, CARDCD1, ETC)
 * — 4단 UNION(기초재고/월간소계/상세/연간소계) + 누계 윈도우함수 구조라 재구성 SELECT 대신
 * 프로시저 CALL 채택(hana.ts CALL 화이트리스트 CF_ prefix 허용, rules.md 예외).
 * 패턴: W3030/page.tsx 복제 (force-dynamic, SearchPanel+SearchField+DataGrid).
 */
import { PageHeader, SearchBar, DataGrid, type Column, type SearchFieldDef } from "@/components/erp";
import { TableBare, TBody, TR, TD } from "@/components/ui";
import { query } from "@/lib/db/hana";
import { callProc } from "@/lib/db/proc";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type InventoryPostRow = {
  NUM: number;
  DOCMONTH: string;
  DOCDATE: string;
  DocTime: number;
  TransType: string;
  DOCNAME: string;
  DOCENTRY: string;
  DOCLINE: string;
  ITEMCODE: string | null;
  WHSNAME: string | null;
  CARDCODE: string | null;
  CARDNAME: string | null;
  INQTY: string; // 프로시저 내부에서 이미 LEGACY_FN_NUMFORMAT 콤마 포맷 문자열로 반환됨
  OUTQTY: string;
  UOM: string | null;
  Comments: string | null;
  InvntAct: string | null;
  Cumulated: string;
  PrjCode: string | null;
  OcrCode: string | null;
  OcrName: string | null;
  PrjName: string | null;
  GLBPNM: string | null;
  GLBPCD: string | null;
};

// JSP 원본 하드코딩 SAPOBJLIST 그대로 재현 (문서유형 필터 옵션 — TransType 코드→문서명)
const DOC_TYPE_OPTIONS = [
  { value: "13", label: "A/R송장" },
  { value: "14", label: "A/R대변메모" },
  { value: "15", label: "(판매)납품" },
  { value: "16", label: "(판매)반품" },
  { value: "17", label: "판매오더" },
  { value: "23", label: "판매견적" },
  { value: "18", label: "A/P송장" },
  { value: "19", label: "A/P대변메모" },
  { value: "20", label: "입고PO" },
  { value: "21", label: "(구매)반품" },
  { value: "22", label: "구매오더" },
  { value: "540000006", label: "구매견적" },
  { value: "24", label: "입금" },
  { value: "25", label: "예금" },
  { value: "30", label: "분개" },
  { value: "46", label: "지급" },
  { value: "57", label: "Checks" },
  { value: "58", label: "재고실사" },
  { value: "59", label: "기타입고" },
  { value: "60", label: "기타출고" },
  { value: "62", label: "재고재평가" },
  { value: "67", label: "재고이전" },
  { value: "69", label: "수입부대비용" },
  { value: "76", label: "Postdated" },
  { value: "162", label: "재고재평가" },
  { value: "203", label: "A/R" },
  { value: "204", label: "A/P" },
  { value: "1250000001", label: "재고이전요청" },
  { value: "310000001", label: "재고기초잔액" },
];

function parseNum(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatQty(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return v; // 이미 프로시저에서 콤마 포맷 완료
}

// 기본 기간: 당월 1일 ~ 오늘 (JSP 원본 curDateF/curDateT 로직 그대로)
function defaultFrom(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mm}-01`;
}
function defaultTo(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const COLUMNS: Column<InventoryPostRow>[] = [
  { key: "DOCNAME", header: "문서유형", align: "center", width: "100px" },
  { key: "DOCENTRY", header: "문서번호", align: "center", width: "90px" },
  { key: "DOCDATE", header: "전기일", align: "center", width: "110px" },
  { key: "ITEMCODE", header: "품목코드", width: "150px" },
  { key: "WHSNAME", header: "창고", align: "center", width: "130px" },
  {
    key: "GLBPCD",
    header: "GL/BP 코드",
    width: "110px",
    // 프로시저가 이미 BP 우선/계정 폴백으로 조인 완료해서 반환 (코드→이름 규칙 충족)
    render: (r) => r.GLBPCD ?? "-",
  },
  {
    key: "GLBPNM",
    header: "GL/BP 이름",
    render: (r) => r.GLBPNM ?? "-",
  },
  { key: "INQTY", header: "입고수량", align: "right", width: "100px", render: (r) => formatQty(r.INQTY) },
  { key: "OUTQTY", header: "출고수량", align: "right", width: "100px", render: (r) => formatQty(r.OUTQTY) },
  { key: "Cumulated", header: "재고수량(누계)", align: "right", width: "110px", render: (r) => formatQty(r.Cumulated) },
  { key: "UOM", header: "재고단위", align: "center", width: "90px" },
  { key: "DOCLINE", header: "전표행", align: "center", width: "70px" },
  { key: "Comments", header: "비고" },
  { key: "OcrName", header: "코스트센터", align: "center", width: "120px" },
  { key: "PrjName", header: "프로젝트", align: "center", width: "120px" },
];

const MAX_DISPLAY = 500;

export default async function W5060Page({
  searchParams,
}: {
  searchParams: Promise<{
    searchFrom?: string;
    searchTo?: string;
    sItemCd?: string;
    sWhsCd?: string;
    sType?: string;
    sCardNm?: string;
  }>;
}) {
  const sp = await searchParams;
  const searchFrom = sp.searchFrom?.trim() || defaultFrom();
  const searchTo = sp.searchTo?.trim() || defaultTo();
  const sItemCd = sp.sItemCd?.trim() ?? "";
  const sWhsCd = sp.sWhsCd?.trim() ?? "";
  const sType = sp.sType?.trim() ?? "";
  const sCardNm = sp.sCardNm?.trim() ?? "";

  const user = await getSession(); // 컬럼·조건 설정을 사용자별로 저장하기 위한 키 (레이아웃이 인증 게이트)

  let items: { ItemCode: string; ItemName: string }[] = [];
  let warehouses: { WhsCode: string; WhsName: string }[] = [];
  let rows: InventoryPostRow[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let error: string | null = null;

  try {
    items = await query<{ ItemCode: string; ItemName: string }>(
      `SELECT "ItemCode", "ItemName" FROM "OITM" ORDER BY "ItemCode"`,
    );
    warehouses = await query<{ WhsCode: string; WhsName: string }>(
      `SELECT "WhsCode", "WhsName" FROM "OWHS" WHERE "Locked"='N' AND "Inactive"='N' ORDER BY "WhsCode"`,
    );

    // CF_W5000(Gubun='J', SDT, EDT, ITEMCD, WHSCD, TYPE, CARDCD1, ETC) — 원본 파라미터 순서 그대로
    // (화이트리스트: src/lib/db/proc.ts — W5070 이 이미 Gubun='W' 로 동일 프로시저 사용 중)
    const all = await callProc<InventoryPostRow>("CF_W5000", [
      "J",
      searchFrom.replace(/-/g, ""),
      searchTo.replace(/-/g, ""),
      sItemCd,
      sWhsCd,
      sType,
      sCardNm,
      "",
    ]);
    rows = all.slice(0, MAX_DISPLAY);
    // 합계는 소계 행(DOCENTRY='' 또는 '0')을 제외한 상세 행만 집계 (프로시저 반환 INQTY/OUTQTY는 콤마 포맷 문자열)
    for (const r of rows) {
      if (r.DOCENTRY && r.DOCENTRY !== "0" && r.ITEMCODE) {
        totalIn += parseNum(r.INQTY);
        totalOut += parseNum(r.OUTQTY);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 조회조건 풀 — 기존 SearchField 를 SearchFieldDef 로 이관. 품목·창고 옵션은 런타임 조회(items/warehouses) 의존이라 컴포넌트 내부 구성.
  const SEARCH_FIELDS: SearchFieldDef[] = [
    { name: "searchFrom", label: "전기일(시작)", kind: "date" },
    { name: "searchTo", label: "전기일(종료)", kind: "date" },
    {
      name: "sItemCd",
      label: "품목",
      kind: "select",
      options: [
        { value: "", label: "전체" },
        ...items.map((i) => ({ value: i.ItemCode, label: `${i.ItemCode} ${i.ItemName}` })),
      ],
    },
    {
      name: "sWhsCd",
      label: "창고",
      kind: "select",
      options: [
        { value: "", label: "전체" },
        ...warehouses.map((w) => ({ value: w.WhsCode, label: w.WhsName })),
      ],
    },
    {
      name: "sType",
      label: "문서유형",
      kind: "select",
      options: [{ value: "", label: "전체" }, ...DOC_TYPE_OPTIONS],
    },
    { name: "sCardNm", label: "업체명(부분검색)", kind: "text", placeholder: "거래처명 일부 입력" },
  ];

  return (
    <div>
      <PageHeader
        title="재고 이동 내역"
        description="W5060 · 레퍼런스 정밀복제 — OINM(재고이동 원장) 기반 재고전기리스트(레거시 실동작, CF_W5000)"
      />

      <SearchBar
        fields={SEARCH_FIELDS}
        values={{ searchFrom, searchTo, sItemCd, sWhsCd, sType, sCardNm }}
        storageKey={`b1w:search:W5060:${user?.uid ?? "anon"}`}
      />

      {error ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
          조회 오류: {error}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {rows.length.toLocaleString()}건{rows.length >= MAX_DISPLAY ? ` (상위 ${MAX_DISPLAY}건만 표시)` : ""}
          </p>
          <DataGrid<InventoryPostRow>
            columns={COLUMNS}
            rows={rows}
            getRowKey={(r) => r.NUM}
            emptyText="조건에 맞는 재고전기 내역이 없습니다."
            storageKey={`b1w:cols:W5060:${user?.uid ?? "anon"}`}
          />
          {rows.length > 0 && (
            <div className="mt-2 w-full overflow-x-auto rounded-card bg-surface-2">
              <TableBare>
                <TBody>
                  <TR className="border-0">
                    <TD colSpan={7} className="text-right font-bold">
                      합계 (소계행 제외)
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{totalIn.toLocaleString()}</TD>
                    <TD className="text-right font-bold tabular-nums">{totalOut.toLocaleString()}</TD>
                    <TD colSpan={6} />
                  </TR>
                </TBody>
              </TableBare>
            </div>
          )}
        </>
      )}
    </div>
  );
}

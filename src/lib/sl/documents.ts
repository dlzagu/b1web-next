/**
 * 문서 생성/수정/취소 (서버 전용) — 문서흐름 계약의 단일 정의부.
 *
 * 원칙:
 * - 쓰기는 이 계층 경유만 (표준테이블 직접 DML 금지 — CLAUDE.md).
 * - 생성은 멱등이 아님 → 호출부는 모호한 실패 시 재시도 금지, 헤더 조회로 상태 확인 후 판단.
 * - 취소는 문서 삭제가 아니라 취소 마킹(+ 후속문서 가드·상위문서 미결수량 복원).
 *
 * ⚠️ 아래 페이로드 타입(UdfValues·OrderLineInput·OBJ·BaseType/BaseEntry/BaseLine)은
 *    **SAP Service Layer 계약 그대로**다. 포트폴리오 전환에서 실행부만 로컬 ERP
 *    엔진(./localErp)으로 바뀌었고, 화면·액션 계층은 이 계약을 그대로 쓴다.
 */
import "server-only";
import {
  engineCancel,
  engineCreate,
  engineCreateFromBase,
  engineUpdate,
  type EngineLine,
} from "./localErp";

/** 사용자정의필드(UDF) 값 맵 — 키는 실제 컬럼명 U_<Alias>. 문서 헤더/라인에 그대로 저장된다. */
export type UdfValues = Record<string, string | number | null>;

export interface OrderLineInput {
  ItemCode: string;
  Quantity: number;
  WarehouseCode?: string;
  Price?: number;
  /** 세금그룹 (매출 OVTG Category='O', 예: A8 과세-세금계산서) */
  VatGroup?: string;
  /** 납품예정일 "YYYY-MM-DD" */
  ShipDate?: string;
  /** 차원1 코스트센터 (손익 직접 코스트센터 U_DIRECTYN='D') */
  CostingCode?: string;
  /** 라인 UDF (U_* 컬럼값) */
  udf?: UdfValues;
}

export interface CreateSalesOrderInput {
  CardCode: string;
  CardName?: string;
  /** 통화 (기본 KRW) */
  DocCurrency?: string;
  /** 전기일 "YYYY-MM-DD". 미지정 시 오늘 */
  DocDate?: string;
  DocDueDate: string; // "YYYY-MM-DD"
  BPLId: number; // 지점 (BPL_IDAssignedToInvoice)
  /** 영업사원 코드 (미지정 시 -1 미지정) */
  SalesPersonCode?: number;
  /** 고객 참조번호 (상세 탭) */
  NumAtCard?: string;
  /** 지불조건 코드 OCTG.GroupNum. 미지정 시 BP 기본값 상속 */
  PaymentGroupCode?: number;
  /** 저널 적요 (기타 탭) */
  JournalMemo?: string;
  comments?: string;
  /** 헤더 UDF (U_* 컬럼값) */
  udf?: UdfValues;
  lines: OrderLineInput[];
}

export interface CreatedDoc {
  DocEntry: number;
  DocNum: number;
}

/** 문서 라인 입력 → 엔진 라인 (SL DocumentLines 매핑과 동일 필드 대응) */
function toEngineLines(
  lines: (OrderLineInput & { LineNum?: number })[],
): EngineLine[] {
  return lines.map((l) => ({
    ItemCode: l.ItemCode,
    Quantity: l.Quantity,
    Price: l.Price,
    VatGroup: l.VatGroup,
    ShipDate: l.ShipDate,
    WarehouseCode: l.WarehouseCode,
    CostingCode: l.CostingCode,
    LineNum: l.LineNum,
    udf: l.udf,
  }));
}

/** 판매주문 생성 (Orders). 성공 시 DocEntry/DocNum 반환. */
export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<CreatedDoc> {
  if (!input.lines.length) throw new Error("주문 라인이 비어 있습니다.");
  return engineCreate(
    "Orders",
    {
      CardCode: input.CardCode,
      CardName: input.CardName,
      DocCurrency: input.DocCurrency,
      DocDate: input.DocDate,
      DocDueDate: input.DocDueDate,
      BPLId: input.BPLId,
      SalesPersonCode: input.SalesPersonCode,
      NumAtCard: input.NumAtCard,
      PaymentGroupCode: input.PaymentGroupCode,
      JournalMemo: input.JournalMemo,
      comments: input.comments,
      udf: input.udf,
    },
    toEngineLines(input.lines),
  );
}

export interface UpdateOrderLineInput extends OrderLineInput {
  /** 기존 라인 매칭용 LineNum. 신규 라인은 생략(새 LineNum 할당). */
  LineNum?: number;
}

export interface UpdateSalesOrderInput {
  DocEntry: number;
  /** 편집 허용 헤더 — 납기일 (CardCode·DocDate·BPL 은 게시 후 변경 제약이라 미편집) */
  DocDueDate: string;
  NumAtCard?: string;
  PaymentGroupCode?: number;
  JournalMemo?: string;
  comments?: string;
  udf?: UdfValues;
  lines: UpdateOrderLineInput[];
}

/**
 * 판매주문 수정.
 * 라인은 부분 diff 가 아니라 **컬렉션 전체 교체** — 한 줄만 고쳐도 전체 라인을 재전송하며,
 * 기존 라인은 LineNum 으로 매칭한다. 이미 이월(후속문서 반영)된 수량은 줄일 수 없다.
 */
export async function updateSalesOrder(
  input: UpdateSalesOrderInput,
): Promise<void> {
  if (!input.lines.length) throw new Error("주문 라인이 비어 있습니다.");
  engineUpdate(
    "Orders",
    input.DocEntry,
    {
      DocDueDate: input.DocDueDate,
      NumAtCard: input.NumAtCard,
      PaymentGroupCode: input.PaymentGroupCode,
      JournalMemo: input.JournalMemo,
      comments: input.comments,
      udf: input.udf,
    },
    toEngineLines(input.lines),
  );
}

/** 판매주문 취소. */
export async function cancelSalesOrder(docEntry: number): Promise<void> {
  engineCancel("Orders", docEntry);
}

// ── 구매주문 (밑바닥 생성/수정/취소) — 판매주문 미러 ──
export interface CreatePurchaseOrderInput {
  CardCode: string; // 공급처(Vendor) BP코드
  CardName?: string;
  DocCurrency?: string;
  DocDate?: string;
  DocDueDate: string; // "YYYY-MM-DD"
  /** 지점 — 구매는 선택 */
  BPLId?: number;
  /** 구매담당 코드 (OSLP 재사용) — 미지정 시 생략 */
  SalesPersonCode?: number;
  /** 공급처 참조번호 (상세 탭) */
  NumAtCard?: string;
  PaymentGroupCode?: number;
  JournalMemo?: string;
  comments?: string;
  /** 헤더 UDF (U_* 컬럼값) */
  udf?: UdfValues;
  /** 라인 — 구매는 CostingCode 미필수. VatGroup 은 매입 OVTG Category='I' */
  lines: OrderLineInput[];
}

/** 구매주문 생성 (PurchaseOrders). 성공 시 DocEntry/DocNum 반환. */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<CreatedDoc> {
  if (!input.lines.length) throw new Error("구매오더 라인이 비어 있습니다.");
  return engineCreate(
    "PurchaseOrders",
    {
      CardCode: input.CardCode,
      CardName: input.CardName,
      DocCurrency: input.DocCurrency,
      DocDate: input.DocDate,
      DocDueDate: input.DocDueDate,
      BPLId: input.BPLId,
      SalesPersonCode: input.SalesPersonCode,
      NumAtCard: input.NumAtCard,
      PaymentGroupCode: input.PaymentGroupCode,
      JournalMemo: input.JournalMemo,
      comments: input.comments,
      udf: input.udf,
    },
    toEngineLines(input.lines),
  );
}

export interface UpdatePurchaseOrderInput {
  DocEntry: number;
  DocDueDate: string;
  NumAtCard?: string;
  PaymentGroupCode?: number;
  JournalMemo?: string;
  comments?: string;
  udf?: UdfValues;
  lines: UpdateOrderLineInput[];
}

/** 구매주문 수정 — 판매주문과 동일 규칙(라인 컬렉션 전체 교체). */
export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput,
): Promise<void> {
  if (!input.lines.length) throw new Error("구매오더 라인이 비어 있습니다.");
  engineUpdate(
    "PurchaseOrders",
    input.DocEntry,
    {
      DocDueDate: input.DocDueDate,
      NumAtCard: input.NumAtCard,
      PaymentGroupCode: input.PaymentGroupCode,
      JournalMemo: input.JournalMemo,
      comments: input.comments,
      udf: input.udf,
    },
    toEngineLines(input.lines),
  );
}

/** 구매주문 취소. */
export async function cancelPurchaseOrder(docEntry: number): Promise<void> {
  engineCancel("PurchaseOrders", docEntry);
}

// ── 문서연결 (문서흐름: 오더→납품→송장) ─────────────────────────
/** SAP B1 오브젝트 타입(BaseType) — 문서연결 상위문서 지정용 */
export const OBJ = {
  SalesOrder: 17,
  Delivery: 15,
  ARInvoice: 13,
  PurchaseOrder: 22,
  GoodsReceiptPO: 20,
  APInvoice: 18,
} as const;

/** 문서연결 라인 — 상위문서 라인을 BaseType/BaseEntry/BaseLine 으로 참조 */
export interface DrawLineInput {
  /** 상위문서 오브젝트타입 (예: 17=판매오더) */
  BaseType: number;
  /** 상위문서 DocEntry */
  BaseEntry: number;
  /** 상위문서 라인 LineNum */
  BaseLine: number;
  /** 이번 문서에 반영할 수량 (미납수량 이하). 부분 이월 가능 */
  Quantity: number;
  /** 라인 UDF (U_* 컬럼값) */
  udf?: UdfValues;
}

export interface CreateFromBaseInput {
  /** 대상 엔티티 — "DeliveryNotes" | "Invoices" | "PurchaseDeliveryNotes" | "PurchaseInvoices" */
  entity: string;
  /** 상위문서 거래처(동일해야 함). 라인 품목·단가·창고·코스트센터·세금그룹은 base 에서 복사된다 */
  CardCode: string;
  DocDate?: string;
  DocDueDate?: string;
  NumAtCard?: string;
  comments?: string;
  /** 헤더 UDF (U_* 컬럼값). 라인 UDF 는 DrawLineInput.udf 로 각 라인에 */
  udf?: UdfValues;
  lines: DrawLineInput[];
}

/**
 * 문서연결 생성 — 상위문서 라인을 참조해 하위문서 생성 (오더→납품, 납품→송장).
 * 라인엔 BaseType/BaseEntry/BaseLine/Quantity 만 주면 나머지(품목·단가·창고·코스트센터·세금)는
 * base 에서 복사되고, 상위 라인의 미결수량이 차감된다(전량 이월 시 라인·문서 마감).
 * 업무규칙 위반(미결수량 초과·거래처 불일치·취소 문서 등)은 예외로 던진다.
 */
export async function createFromBase(
  input: CreateFromBaseInput,
): Promise<CreatedDoc> {
  if (!input.lines.length) throw new Error("이월할 라인이 없습니다.");
  return engineCreateFromBase(
    input.entity,
    {
      CardCode: input.CardCode,
      DocDate: input.DocDate,
      DocDueDate: input.DocDueDate,
      NumAtCard: input.NumAtCard,
      comments: input.comments,
      udf: input.udf,
    },
    input.lines.map((l) => ({
      BaseType: l.BaseType,
      BaseEntry: l.BaseEntry,
      BaseLine: l.BaseLine,
      Quantity: l.Quantity,
      udf: l.udf,
    })),
  );
}

/** 문서 취소 (범용) — Orders/DeliveryNotes/Invoices 등 */
export async function cancelDocument(
  entity: string,
  docEntry: number,
): Promise<void> {
  engineCancel(entity, docEntry);
}

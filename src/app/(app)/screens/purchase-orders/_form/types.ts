/** 구매주문 생성/수정 폼 공유 타입 (서버 액션 계약 + 클라 상태). 판매주문 미러. */

export type Opt = { value: string; label: string };
/** 세금그룹 옵션 — 세율(Rate) 포함(세액 클라 계산용) */
export type VatOpt = { value: string; label: string; rate: number };

/** 폼 라인 상태 — 입력은 문자열(controlled), lineNum 은 편집 시 기존 라인 매칭용 */
export type PurchaseOrderLineValue = {
  key: string;
  itemCode: string;
  itemName: string;
  quantity: string;
  price: string;
  vatGroup: string;
  shipDate: string;
  whsCode: string;
  costingCode: string;
  lineNum?: number;
  /** 라인 UDF 값 (U_* 컬럼 → 문자열). 상세에서 켠 컬럼만 입력 노출 */
  udf: Record<string, string>;
};

export type PurchaseOrderInitial = {
  cardCode: string;
  cardName: string;
  currency: string;
  docDate: string;
  docDueDate: string;
  bplId: string;
  /** 구매담당 코드 — 해당 테넌트는 OSLP 0건이라 "" (미지정) */
  slpCode: string;
  /** 공급처 참조번호 (상세 탭) */
  numAtCard: string;
  /** 지불조건 코드 OCTG.GroupNum (상세 탭). "" = BP 기본 상속 */
  paymentGroup: string;
  /** 저널 적요 (기타 탭) */
  journalMemo: string;
  /** 문서번호(수정 시 표시) / 신규는 "" */
  docNum: string;
  comments: string;
  /** 헤더 UDF 값 (U_* 컬럼 → 문자열). 수정 시 프리필 */
  headerUdf: Record<string, string>;
  lines: PurchaseOrderLineValue[];
};

/** 저장 액션 페이로드 (docEntry 있으면 수정, 없으면 생성) */
export type SavePurchaseOrderPayload = {
  docEntry?: number;
  cardCode: string;
  cardName?: string;
  currency: string;
  docDate?: string;
  docDueDate: string;
  bplId: number;
  slpCode?: number;
  numAtCard?: string;
  paymentGroup?: number;
  journalMemo?: string;
  comments: string;
  /** 헤더 UDF (U_* → 값) */
  udf?: Record<string, string>;
  lines: {
    itemCode: string;
    quantity: number;
    price?: number;
    vatGroup?: string;
    shipDate?: string;
    whsCode?: string;
    costingCode?: string;
    lineNum?: number;
    /** 라인 UDF (U_* → 값) */
    udf?: Record<string, string>;
  }[];
};

export type SavePurchaseOrderResult =
  | { ok: true; docEntry: number; docNum?: number }
  | { ok: false; error: string };

export type CancelPurchaseOrderResult = { ok: true } | { ok: false; error: string };

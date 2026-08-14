/**
 * 문서연결(draw) 생성 폼 공유 타입 — 상위문서 미납/미청구 라인을 하위문서로 이월.
 * 오더→납품 / 납품→송장 / 구매오더→입고 / 입고→매입송장 이 공유(클라·서버 공용, server-only 아님).
 */

/** 가져오기 모달의 열린 상위문서 1건 */
export type OpenBaseDoc = {
  docEntry: number;
  docNum: number;
  cardCode: string;
  cardName: string;
  docDate: string;
  docCur: string | null;
  openTotal: number;
};

/** 상위문서의 미납/미청구 라인 1건 (draw 대상) */
export type OpenBaseLine = {
  baseEntry: number; // 상위문서 DocEntry
  baseLine: number; // 상위문서 LineNum
  itemCode: string;
  itemName: string | null;
  baseQty: number; // 상위문서 라인 수량(주문/납품수량)
  openQty: number; // 미납/미청구 수량
  price: number;
  whsCode: string;
  whsName: string | null;
};

/** 폼 라인 상태 — 상위문서에서 끌어온 라인 + 이번 이월수량(문자열 입력) */
export type DrawLineValue = {
  key: string;
  baseEntry: number;
  baseLine: number;
  itemCode: string;
  itemName: string;
  baseQty: number;
  openQty: number;
  quantity: string; // 이번 이월수량 (≤ openQty)
  price: number;
  whsCode: string;
  whsName: string;
  /** 라인 UDF 값 (U_* → 문자열). 상세에서 켠 라인 컬럼만 입력 노출 */
  udf?: Record<string, string>;
};

export type DrawInitial = {
  cardCode: string;
  cardName: string;
  currency: string;
  docDate: string;
  docDueDate: string;
  numAtCard: string;
  comments: string;
  /** 헤더 UDF 초기값(U_<alias> → 값). 상세 헤더선택대로 입력칸 노출 */
  headerUdf: Record<string, string>;
  lines: DrawLineValue[];
};

export type SavePayload = {
  cardCode: string;
  docDate?: string;
  docDueDate?: string;
  numAtCard?: string;
  comments?: string;
  /** 헤더 UDF (U_* 컬럼값). 라인 UDF 는 각 라인 udf 로 */
  udf?: Record<string, string>;
  lines: { baseEntry: number; baseLine: number; quantity: number; udf?: Record<string, string> }[];
};

export type SaveResult = { ok: true; docEntry: number; docNum?: number } | { ok: false; error: string };
export type CancelResult = { ok: true } | { ok: false; error: string };

/** 서버 액션 3종(클라 폼에 주입) */
export type DrawActions = {
  fetchOpenBase: (cardCode?: string) => Promise<OpenBaseDoc[]>;
  fetchBaseLines: (
    docEntry: number,
  ) => Promise<{ cardCode: string; cardName: string; docCur: string | null; lines: OpenBaseLine[] } | null>;
  save: (p: SavePayload) => Promise<SaveResult>;
};

/** 문서종류별 화면 라벨(클라 폼 주입용 — 오더→납품 vs 납품→송장 등) */
export type DrawLabels = {
  newTitle: string; // "납품 신규 (오더 연결)"
  saveLabel: string; // "저장 (납품 생성)"
  failLabel: string; // "납품 생성" (→ "{failLabel} 실패: ...")
  listHref: string; // "/screens/deliveries"
  note: string; // 하단 안내문
  importLabel: string; // "가져오기 (오더)"
  lineCardTitle: string; // "납품 라인 (오더 미납분)"
  emptyLines: string; // "판매오더를 선택하면 미납 라인이 여기 채워집니다." (앞에 '가져오기로' 붙음)
  baseQtyCol: string; // "주문수량"
  openQtyCol: string; // "미납수량"
  qtyCol: string; // "납품수량"
  baseRefCol: string; // "오더"
  qtyTotalLabel: string; // "납품수량"
  modalTitle: string; // "판매오더 가져오기"
  baseNumCol: string; // "오더번호"
  openTotalCol: string; // "미납금액"
  emptyImport: string; // "미납 오더가 없습니다."
};

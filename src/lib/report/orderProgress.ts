/**
 * 판매 문서체인(오더 → 납품 → 매출송장) 진행 계약 — 수주 진행 현황 화면과 스모크가 **같은 정의**를 쓴다.
 *
 * 화면(page.tsx)에 술어를 직접 박아두면 '단계 배지'와 '단계 필터'가 서로 다른 정의로 갈라져도
 * 아무도 못 잡는다(실제로 갈라져서 '청구완료'로 거른 결과에 '부분납품' 배지가 섞였다).
 * 여기 한 곳에 두고 스모크가 파티션 성질(합=전체, 배지=필터 일치)을 검증한다.
 */

/** 자식 롤업 CTE — 납품(DLV)·송장(INVQ)을 '오더 라인' 좌표로 접는다.
 *  두 CTE 모두 자식 헤더를 조인해 취소건을 걷어낸다(없으면 취소 문서가 이중계상된다). */
export const CHAIN_CTE = `WITH "DLV" AS (
  SELECT d."BaseEntry" AS "OE", d."BaseLine" AS "OL",
         SUM(d."Quantity") AS "DQTY", SUM(d."LineTotal") AS "DAMT",
         SUM(d."VatSum") AS "DVAT", SUM(d."GTotal") AS "DTOT",
         MIN(dh."DocDate") AS "FIRSTDLV"
    FROM "DLN1" d
    JOIN "ODLN" dh ON dh."DocEntry" = d."DocEntry"
   WHERE d."BaseType" = 17 AND dh."CANCELED" = 'N'
   GROUP BY d."BaseEntry", d."BaseLine"
),
"INVQ" AS (
  SELECT d."BaseEntry" AS "OE", d."BaseLine" AS "OL",
         SUM(i."Quantity") AS "IQTY", SUM(i."LineTotal") AS "IAMT",
         SUM(i."VatSum") AS "IVAT", SUM(i."GTotal") AS "ITOT"
    FROM "INV1" i
    JOIN "OINV" ih ON ih."DocEntry" = i."DocEntry"
    JOIN "DLN1" d  ON d."DocEntry"  = i."BaseEntry" AND d."LineNum" = i."BaseLine"
    JOIN "ODLN" dh ON dh."DocEntry" = d."DocEntry"
   WHERE i."BaseType" = 15 AND d."BaseType" = 17
     AND ih."CANCELED" = 'N' AND dh."CANCELED" = 'N'
   GROUP BY d."BaseEntry", d."BaseLine"
)`;

/**
 * 진행단계 — 라인 기준 **완전 분할(partition)**.
 * 순서대로 앞 단계에 걸리면 그 단계다(= 배지 CASE 의 우선순위와 동치).
 *  · 미착수      납품 0
 *  · 부분납품    납품 있음 + 미납 남음
 *  · 납품완료    전량 납품 + 청구 0
 *  · 부분청구    전량 납품 + 일부만 청구        ← 납품수량 > 송장수량
 *  · 청구완료    전량 납품 + 전량 청구
 * where 술어는 서로 배타적이어야 한다(스모크 [8] 이 합=전체·배지=필터 일치를 검증).
 */
export const ORDER_STAGES: {
  value: string;
  label: string;
  where: string;
  /** 이 필터로 거른 행이 가져야 하는 단계 배지 값 (스모크가 대조한다) */
  badge?: string;
}[] = [
  { value: "", label: "전체", where: "" },
  { value: "none", label: "미착수", where: `COALESCE(v."DQTY", 0) = 0`, badge: "미착수" },
  {
    value: "part",
    label: "부분납품",
    where: `COALESCE(v."DQTY", 0) > 0 AND l."OpenQty" > 0`,
    badge: "부분납품",
  },
  {
    value: "dlv",
    label: "납품완료·미청구",
    where: `COALESCE(v."DQTY", 0) > 0 AND l."OpenQty" = 0 AND COALESCE(n."IQTY", 0) = 0`,
    badge: "납품완료",
  },
  {
    value: "inv-part",
    label: "부분청구",
    where: `COALESCE(v."DQTY", 0) > 0 AND l."OpenQty" = 0 AND COALESCE(n."IQTY", 0) > 0 AND COALESCE(n."IQTY", 0) < COALESCE(v."DQTY", 0)`,
    badge: "부분청구",
  },
  {
    value: "inv",
    label: "청구완료",
    where: `COALESCE(v."DQTY", 0) > 0 AND l."OpenQty" = 0 AND COALESCE(n."IQTY", 0) >= COALESCE(v."DQTY", 0)`,
    badge: "청구완료",
  },
];

/** 화면 하단 상세와 **같은 FROM/JOIN** — 스모크가 화면 쿼리를 그대로 재현해 검증하기 위한 공용 조각 */
export const CHAIN_JOINS = `FROM "ORDR" h
  JOIN "RDR1" l ON l."DocEntry" = h."DocEntry"
  LEFT JOIN "DLV"  v ON v."OE" = h."DocEntry" AND v."OL" = l."LineNum"
  LEFT JOIN "INVQ" n ON n."OE" = h."DocEntry" AND n."OL" = l."LineNum"
 WHERE COALESCE(h."CANCELED", 'N') <> 'Y'`;

/** 라벨만 (배지·필터 공용) */
export const STAGE_LABELS = {
  none: "미착수",
  part: "부분납품",
  dlv: "납품완료",
  invPart: "부분청구",
  inv: "청구완료",
} as const;

/**
 * 단계 판정 SQL — 위 술어들과 **같은 순서·같은 경계**여야 한다.
 * (술어는 WHERE 용, 이건 표시용. 둘이 어긋나면 필터 결과와 배지가 모순된다.)
 */
export const STAGE_CASE_SQL = `CASE
         WHEN COALESCE(v."DQTY", 0) = 0 THEN '${STAGE_LABELS.none}'
         WHEN l."OpenQty" > 0 THEN '${STAGE_LABELS.part}'
         WHEN COALESCE(n."IQTY", 0) = 0 THEN '${STAGE_LABELS.dlv}'
         WHEN COALESCE(n."IQTY", 0) < COALESCE(v."DQTY", 0) THEN '${STAGE_LABELS.invPart}'
         ELSE '${STAGE_LABELS.inv}' END`;

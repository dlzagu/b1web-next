/**
 * 매출 피벗(행=거래처/품목 × 열=월) 조회 계약 — 화면과 스모크가 **같은 SQL** 을 쓴다.
 *
 * 화면(page.tsx)이 SQL 을 직접 들고 있으면 스모크는 그 SQL 을 검증할 수 없다. 실제로
 * 적대적 검증에서 측정값을 `GTotal`(VAT 포함) → `LineTotal`(공급가)로 바꾸는 사보타주를
 * 넣었더니 총합이 VAT 만큼 어긋났는데도 `npm run verify` 가 전부 통과했다 — 매출 '금액'을
 * 보는 검사가 하나도 없었기 때문이다. 그래서 조립부를 여기로 빼고, 스모크가 이 함수가 만든
 * 쿼리를 그대로 실행해 헤더 합계(OINV.DocTotal)와 대사한다(→ erp-smoke [10]).
 *
 * 측정값은 **INV1 라인 GTotal(VAT 포함)** 이다. 엔진이 DocTotal = Σ(LineTotal + 라인VAT) 로
 * 만들므로 라인 합 = 헤더 합이 손실 없이 성립하고, 두 탭 총합과 월별 매출 추이가 모두 맞는다.
 */

export type PivotBucket = { key: string; label: string; from: string; to: string };
export type PivotTab = "partner" | "item";

/** 표시 상한. 그룹 수가 이걸 넘으면 합계행이 절단된 집합의 합이 되어 조용히 틀린다(스모크가 가드). */
export const PIVOT_MAX_DISPLAY = 200;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 1월~종료월 **고정** 버킷 — 실데이터에서 월을 뽑으면 매출 없는 달이 열에서 통째로 사라진다 */
export function monthBuckets(year: number, endMonth: number): PivotBucket[] {
  const out: PivotBucket[] = [];
  for (let m = 1; m <= endMonth; m += 1) {
    out.push({
      key: `m${m}`,
      label: `${m}월`,
      from: `${year}-${pad2(m)}-01`,
      to: `${year}-${pad2(m)}-${pad2(lastDayOf(year, m))}`,
    });
  }
  return out;
}

/**
 * 피벗 조회 SQL + 바인딩 파라미터.
 *
 * 🔴 바인딩은 'SQL 텍스트에 ? 가 나오는 순서'다 — 버킷 SUM(CASE) 의 ? 2N 개가 SELECT 절에 있어
 *    WHERE 절 파라미터보다 **앞선다**. params 를 만드는 순서를 바꾸면 에러 없이 0건이 되거나
 *    엉뚱한 기간이 집계된다(이 프로젝트에서 실제로 밟은 함정).
 * 식별자(컬럼 별칭)는 코드 상수에서만 오고, 사용자 입력은 전부 ? 로만 들어간다.
 */
export function buildSalesPivotQuery(o: {
  tab: PivotTab;
  year: number;
  buckets: PivotBucket[];
  sCardCode?: string;
  sItemGrp?: string;
  sItemCd?: string;
}): { sql: string; params: (string | number)[] } {
  const { tab, year, buckets } = o;

  // ① SELECT 절 — 버킷마다 (from, to) 2개
  const aggSel = buckets.map(
    (b) => `SUM(CASE WHEN h."DocDate" BETWEEN ? AND ? THEN l."GTotal" ELSE 0 END) AS "${b.key}"`,
  );
  const params: (string | number)[] = buckets.flatMap((b) => [b.from, b.to]);

  // ② WHERE 절 — 기간(2) → 선택 필터
  const where: string[] = [`h."CANCELED" = 'N'`, `h."DocDate" BETWEEN ? AND ?`];
  params.push(`${year}-01-01`, buckets[buckets.length - 1]?.to ?? `${year}-12-31`);
  if (o.sCardCode) {
    where.push(`h."CardCode" = ?`);
    params.push(o.sCardCode);
  }
  // 🔴 품목 조건은 **두 탭 모두** 적용한다. 거래처별 탭에서만 무시하면, 탭을 옮겼을 때
  //    필터가 URL 에 남은 채 집계에서만 빠져 총합이 조용히 바뀐다(적대적 검증 지적).
  //    두 탭 다 INV1 을 조인하므로 같은 술어가 그대로 성립한다.
  if (o.sItemGrp) {
    where.push(`l."ItemCode" IN (SELECT "ItemCode" FROM "OITM" WHERE "ItmsGrpCod" = ?)`);
    params.push(Number(o.sItemGrp));
  }
  if (o.sItemCd) {
    where.push(`l."ItemCode" = ?`);
    params.push(o.sItemCd);
  }

  const sql =
    tab === "partner"
      ? `SELECT h."CardCode" AS "K1", h."CardName" AS "K2", ${aggSel.join(", ")}
           FROM "OINV" h JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
           WHERE ${where.join(" AND ")}
           GROUP BY h."CardCode", h."CardName"
           ORDER BY SUM(l."GTotal") DESC
           LIMIT ${PIVOT_MAX_DISPLAY}`
      : `SELECT l."ItemCode" AS "K1", COALESCE(i."ItemName", l."Dscription") AS "K2",
                COALESCE(g."ItmsGrpNam", '') AS "K3", ${aggSel.join(", ")}
           FROM "OINV" h
           JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
           LEFT JOIN "OITM" i ON i."ItemCode" = l."ItemCode"
           LEFT JOIN "OITB" g ON g."ItmsGrpCod" = i."ItmsGrpCod"
           WHERE ${where.join(" AND ")}
           GROUP BY l."ItemCode", COALESCE(i."ItemName", l."Dscription"), COALESCE(g."ItmsGrpNam", '')
           ORDER BY SUM(l."GTotal") DESC
           LIMIT ${PIVOT_MAX_DISPLAY}`;

  return { sql, params };
}

/** 조회 결과의 모든 버킷 셀 합 — 화면 합계행(연간 합계 열 합)과 같은 값 */
export function sumBuckets(rows: Record<string, unknown>[], buckets: PivotBucket[]): number {
  let total = 0;
  for (const r of rows) for (const b of buckets) total += Number(r[b.key] ?? 0);
  return total;
}

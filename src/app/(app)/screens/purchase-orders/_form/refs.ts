import "server-only";

/** 구매주문 폼 참조데이터(지점·창고·코스트센터) 로더 — new/edit 페이지 공용. 판매주문 미러.
 *  거래처·품목은 CflPicker 모달 검색이라 사전 로드하지 않음. */
import { query } from "@/lib/db/hana";
import { loadTableUdfs, type UdfDef } from "@/lib/db/udf";
import type { Opt, VatOpt } from "./types";

export async function loadPurchaseOrderRefs(): Promise<{
  branches: Opt[];
  warehouses: Opt[];
  costCenters: Opt[];
  currencies: Opt[];
  vatGroups: VatOpt[];
  paymentTerms: Opt[];
  headerUdfs: UdfDef[];
  lineUdfs: UdfDef[];
}> {
  const [branches, warehouses, costCenters, currencies, vatGroups, paymentTerms, headerUdfs, lineUdfs] = await Promise.all([
    query<{ BPLId: number; BPLName: string }>(
      `SELECT "BPLId", "BPLName" FROM OBPL WHERE "Disabled"='N' ORDER BY "BPLId"`,
    ),
    query<{ WhsCode: string; WhsName: string }>(`SELECT "WhsCode", "WhsName" FROM OWHS ORDER BY "WhsCode"`),
    query<{ PrcCode: string; PrcName: string }>(
      `SELECT "PrcCode", "PrcName" FROM OPRC WHERE "U_DIRECTYN"='D' AND "Active"='Y' AND "DimCode"=1 ORDER BY "PrcCode"`,
    ),
    // 통화 — KRW 최상단 고정
    query<{ CurrCode: string; CurrName: string }>(
      `SELECT "CurrCode", "CurrName" FROM OCRN ORDER BY CASE WHEN "CurrCode"='KRW' THEN 0 ELSE 1 END, "CurrCode"`,
    ),
    // 매입 세금그룹(OVTG Category='I') + 세율. V2((매입)과세-세금계산서) 최상단 고정
    query<{ Code: string; Name: string; Rate: number }>(
      `SELECT "Code", "Name", "Rate" FROM OVTG
       WHERE "Category"='I' AND ("Inactive" IS NULL OR "Inactive"='N')
       ORDER BY CASE WHEN "Code"='V2' THEN 0 ELSE 1 END, "Code"`,
    ),
    // 지불조건 (OCTG) — 상세 탭
    query<{ GroupNum: number; PymntGroup: string }>(
      `SELECT "GroupNum", "PymntGroup" FROM OCTG WHERE "GroupNum" > 0 ORDER BY "GroupNum"`,
    ),
    // UDF 정의 — 헤더(OPOR)/라인(POR1). 생성폼이 상세 선택대로 입력칸 노출
    loadTableUdfs("OPOR"),
    loadTableUdfs("POR1"),
  ]);
  return {
    branches: branches.map((b) => ({ value: String(b.BPLId), label: `${b.BPLId} ${b.BPLName}` })),
    warehouses: warehouses.map((w) => ({ value: w.WhsCode, label: `${w.WhsCode} ${w.WhsName}` })),
    costCenters: costCenters.map((c) => ({ value: c.PrcCode, label: `${c.PrcCode} ${c.PrcName}` })),
    currencies: currencies.map((c) => ({ value: c.CurrCode, label: `${c.CurrCode} ${c.CurrName}` })),
    vatGroups: vatGroups.map((v) => ({ value: v.Code, label: `${v.Code} ${v.Name}`, rate: Number(v.Rate) })),
    paymentTerms: paymentTerms.map((p) => ({ value: String(p.GroupNum), label: p.PymntGroup })),
    headerUdfs,
    lineUdfs,
  };
}

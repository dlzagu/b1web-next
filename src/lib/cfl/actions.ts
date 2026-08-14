"use server";

/**
 * CFL(Choose From List) 검색 — 공통 서버 액션.
 * 검색조건에서 마스터 데이터를 코드 대신 목록에서 고르게 하는 모달의 데이터 공급.
 * 타입은 화이트리스트(SOURCES)로만 허용, 검색어는 파라미터 바인딩(인젝션 안전), 읽기 전용.
 */
import { query } from "@/lib/db/hana";

export type CflColumn = { key: string; header: string; align?: "left" | "right" | "center"; width?: string };
export type CflResult = {
  columns: CflColumn[];
  valueKey: string;
  labelKey: string;
  rows: Record<string, unknown>[];
};

const LIMIT = 50;
const like = (t: string) => `%${t}%`;

type Source = {
  title: string;
  valueKey: string;
  labelKey: string;
  columns: CflColumn[];
  build: (term: string) => { sql: string; params: (string | number)[] };
};

const SOURCES: Record<string, Source> = {
  Customer: {
    title: "거래처(고객)",
    valueKey: "CardCode",
    labelKey: "CardName",
    columns: [
      { key: "CardCode", header: "코드", width: "130px" },
      { key: "CardName", header: "거래처명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "CardCode","CardName" FROM "OCRD" WHERE "CardType"='C' AND "validFor"='Y'${
        t ? ` AND ("CardCode" LIKE ? OR "CardName" LIKE ?)` : ""
      } ORDER BY "CardName"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  Vendor: {
    title: "거래처(공급처)",
    valueKey: "CardCode",
    labelKey: "CardName",
    columns: [
      { key: "CardCode", header: "코드", width: "130px" },
      { key: "CardName", header: "거래처명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "CardCode","CardName" FROM "OCRD" WHERE "CardType"='S' AND "validFor"='Y'${
        t ? ` AND ("CardCode" LIKE ? OR "CardName" LIKE ?)` : ""
      } ORDER BY "CardName"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  Item: {
    title: "품목",
    valueKey: "ItemCode",
    labelKey: "ItemName",
    columns: [
      { key: "ItemCode", header: "코드", width: "160px" },
      { key: "ItemName", header: "품목명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "ItemCode","ItemName" FROM "OITM"${
        t ? ` WHERE ("ItemCode" LIKE ? OR "ItemName" LIKE ?)` : ""
      } ORDER BY "ItemName"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  SalesEmployee: {
    title: "영업사원",
    valueKey: "SlpCode",
    labelKey: "SlpName",
    columns: [
      { key: "SlpCode", header: "코드", align: "right", width: "80px" },
      { key: "SlpName", header: "영업사원명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "SlpCode","SlpName" FROM "OSLP" WHERE "SlpCode" <> -1${
        t ? ` AND "SlpName" LIKE ?` : ""
      } ORDER BY "SlpName"`,
      params: t ? [like(t)] : [],
    }),
  },
  Warehouse: {
    title: "창고",
    valueKey: "WhsCode",
    labelKey: "WhsName",
    columns: [
      { key: "WhsCode", header: "코드", width: "90px" },
      { key: "WhsName", header: "창고명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "WhsCode","WhsName" FROM "OWHS"${
        t ? ` WHERE ("WhsCode" LIKE ? OR "WhsName" LIKE ?)` : ""
      } ORDER BY "WhsCode"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  BusinessPlace: {
    title: "사업장",
    valueKey: "BPLId",
    labelKey: "BPLName",
    columns: [
      { key: "BPLId", header: "코드", align: "right", width: "70px" },
      { key: "BPLName", header: "사업장명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "BPLId","BPLName" FROM "OBPL" WHERE "Disabled"='N'${
        t ? ` AND "BPLName" LIKE ?` : ""
      } ORDER BY "BPLId"`,
      params: t ? [like(t)] : [],
    }),
  },
  Owner: {
    title: "담당자",
    valueKey: "empID",
    labelKey: "empName",
    columns: [
      { key: "empID", header: "코드", align: "right", width: "70px" },
      { key: "empName", header: "담당자명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "empID", (IFNULL("firstName",'') || ' ' || IFNULL("lastName",'')) AS "empName" FROM "OHEM" WHERE "Active"='Y'${
        t ? ` AND (IFNULL("firstName",'') || IFNULL("lastName",'')) LIKE ?` : ""
      } ORDER BY "firstName"`,
      params: t ? [like(t)] : [],
    }),
  },
  ItemGroup: {
    title: "품목분류1",
    valueKey: "code",
    labelKey: "code",
    columns: [{ key: "code", header: "품목분류1" }],
    build: (t) => ({
      sql: `SELECT DISTINCT "U_ItemGR1" AS "code" FROM "OITM" WHERE "U_ItemGR1" IS NOT NULL AND "U_ItemGR1" <> ''${
        t ? ` AND "U_ItemGR1" LIKE ?` : ""
      } ORDER BY "code"`,
      params: t ? [like(t)] : [],
    }),
  },
  CostCenter: {
    title: "코스트센터",
    valueKey: "OcrCode",
    labelKey: "OcrName",
    columns: [
      { key: "OcrCode", header: "코드", width: "110px" },
      { key: "OcrName", header: "코스트센터명" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "OcrCode","OcrName" FROM "OOCR" WHERE "DimCode"=1${
        t ? ` AND ("OcrCode" LIKE ? OR "OcrName" LIKE ?)` : ""
      } ORDER BY "OcrCode"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  VatGroupSales: {
    title: "세금그룹(매출)",
    valueKey: "Code",
    labelKey: "Name",
    columns: [
      { key: "Code", header: "코드", width: "70px" },
      { key: "Name", header: "세금그룹명" },
      { key: "Rate", header: "세율%", align: "right", width: "70px" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "Code","Name","Rate" FROM "OVTG" WHERE "Category"='O'${
        t ? ` AND ("Code" LIKE ? OR "Name" LIKE ?)` : ""
      } ORDER BY "Code"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
  VatGroupPurchase: {
    title: "세금그룹(매입)",
    valueKey: "Code",
    labelKey: "Name",
    columns: [
      { key: "Code", header: "코드", width: "70px" },
      { key: "Name", header: "세금그룹명" },
      { key: "Rate", header: "세율%", align: "right", width: "70px" },
    ],
    build: (t) => ({
      sql: `SELECT TOP ${LIMIT} "Code","Name","Rate" FROM "OVTG" WHERE "Category"='I'${
        t ? ` AND ("Code" LIKE ? OR "Name" LIKE ?)` : ""
      } ORDER BY "Code"`,
      params: t ? [like(t), like(t)] : [],
    }),
  },
};

export async function cflSearch(type: string, term: string): Promise<CflResult> {
  const src = SOURCES[type];
  if (!src) throw new Error(`알 수 없는 CFL 타입: ${type}`);
  const { sql, params } = src.build((term ?? "").trim());
  const rows = await query<Record<string, unknown>>(sql, params);
  return { columns: src.columns, valueKey: src.valueKey, labelKey: src.labelKey, rows };
}

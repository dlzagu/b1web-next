/**
 * 데모 DB 스키마 — SAP B1 표준 테이블의 **화면이 실제로 읽는 컬럼 부분집합**을
 * 테이블·컬럼명 그대로 재현한다 (조회 화면 30여 개의 사용 컬럼 전수 조사 기준).
 *
 * 날짜는 TEXT 'YYYY-MM-DD' — HANA 호환 함수(TO_VARCHAR)와 문자열 비교가 그대로 성립한다.
 * UDF: OITM.U_ItemGR1 · OPRC.U_DIRECTYN (화면 하드코딩 참조) + CUFD 동적 UDF
 * (ORDR/OPOR.U_PJT, RDR1/POR1.U_Memo — 생성폼·상세의 동적 UDF 데모용).
 */

/** 마케팅문서 헤더 공통 컬럼 (ORDR·ODLN·OINV·OPOR·OPDN·OPCH 동일 구조) */
const DOC_HEADER = `
  "DocEntry"   INTEGER PRIMARY KEY,
  "DocNum"     INTEGER,
  "DocDate"    TEXT,
  "DocDueDate" TEXT,
  "TaxDate"    TEXT,
  "CardCode"   TEXT,
  "CardName"   TEXT,
  "NumAtCard"  TEXT,
  "DocCur"     TEXT DEFAULT 'KRW',
  "DocRate"    REAL DEFAULT 1,
  "DocTotal"   REAL DEFAULT 0,
  "DocTotalFC" REAL DEFAULT 0,
  "VatSum"     REAL DEFAULT 0,
  "DiscSum"    REAL DEFAULT 0,
  "PaidToDate" REAL DEFAULT 0,
  "GroupNum"   INTEGER DEFAULT -1,
  "SlpCode"    INTEGER DEFAULT -1,
  "BPLId"      INTEGER,
  "Comments"   TEXT,
  "JrnlMemo"   TEXT,
  "CreateDate" TEXT,
  "DocStatus"  TEXT DEFAULT 'O',
  "CANCELED"   TEXT DEFAULT 'N',
  "TransId"    INTEGER`;

/** 마케팅문서 라인 공통 컬럼 (RDR1·DLN1·INV1·POR1·PDN1·PCH1 동일 구조) */
const DOC_LINE = `
  "DocEntry"   INTEGER,
  "LineNum"    INTEGER,
  "ItemCode"   TEXT,
  "Dscription" TEXT,
  "Quantity"   REAL DEFAULT 0,
  "OpenQty"    REAL DEFAULT 0,
  "unitMsr"    TEXT,
  "Price"      REAL DEFAULT 0,
  "DiscPrcnt"  REAL DEFAULT 0,
  "VatGroup"   TEXT,
  "LineTotal"  REAL DEFAULT 0,
  "VatSum"     REAL DEFAULT 0,
  "GTotal"     REAL DEFAULT 0,
  "ShipDate"   TEXT,
  "WhsCode"    TEXT,
  "OcrCode"    TEXT,
  "LineStatus" TEXT DEFAULT 'O',
  "BaseType"   INTEGER DEFAULT -1,
  "BaseEntry"  INTEGER,
  "BaseLine"   INTEGER,
  PRIMARY KEY ("DocEntry", "LineNum")`;

function docPair(
  header: string,
  line: string,
  headerExtra = "",
  lineExtra = "",
): string {
  return `
CREATE TABLE "${header}" (${DOC_HEADER}${headerExtra});
CREATE TABLE "${line}" (${DOC_LINE.replace('PRIMARY KEY ("DocEntry", "LineNum")', "")}${lineExtra} PRIMARY KEY ("DocEntry", "LineNum"));
CREATE INDEX "idx_${line}_base" ON "${line}" ("BaseType", "BaseEntry");
CREATE INDEX "idx_${header}_date" ON "${header}" ("DocDate");`;
}

export const SCHEMA_SQL = `
${docPair("ORDR", "RDR1", `, "U_PJT" TEXT`, ` "U_Memo" TEXT,`)}
${docPair("ODLN", "DLN1")}
${docPair("OINV", "INV1")}
${docPair("OPOR", "POR1", `, "U_PJT" TEXT`, ` "U_Memo" TEXT,`)}
${docPair("OPDN", "PDN1")}
${docPair("OPCH", "PCH1")}

-- 재고이전요청 (W5030) — 출고창고가 Filler 컬럼인 표준 B1 매핑 그대로
CREATE TABLE "OWTQ" (${DOC_HEADER}, "Filler" TEXT, "ToWhsCode" TEXT, "Address" TEXT);
CREATE TABLE "WTQ1" (${DOC_LINE.replace('PRIMARY KEY ("DocEntry", "LineNum")', 'PRIMARY KEY ("DocEntry", "LineNum")')});

-- ── 마스터 ─────────────────────────────────────────────
CREATE TABLE "OADM" ("CompnyName" TEXT);

CREATE TABLE "OITM" (
  "ItemCode"   TEXT PRIMARY KEY,
  "ItemName"   TEXT,
  "FrgnName"   TEXT,
  "ItmsGrpCod" INTEGER,
  "PrchseItem" TEXT DEFAULT 'Y',
  "SellItem"   TEXT DEFAULT 'Y',
  "InvntItem"  TEXT DEFAULT 'Y',
  "OnHand"     REAL DEFAULT 0,
  "IsCommited" REAL DEFAULT 0,
  "OnOrder"    REAL DEFAULT 0,
  "AvgPrice"   REAL DEFAULT 0,
  "CodeBars"   TEXT,
  "CardCode"   TEXT,
  "validFor"   TEXT DEFAULT 'Y',
  "FirmName"   TEXT,
  "U_ItemGR1"  TEXT
);
CREATE TABLE "OITB" ("ItmsGrpCod" INTEGER PRIMARY KEY, "ItmsGrpNam" TEXT);
CREATE TABLE "OITW" (
  "ItemCode" TEXT, "WhsCode" TEXT,
  "OnHand" REAL DEFAULT 0, "IsCommited" REAL DEFAULT 0, "OnOrder" REAL DEFAULT 0,
  "MinStock" REAL DEFAULT 0, "MaxStock" REAL DEFAULT 0,
  "WasCounted" TEXT DEFAULT 'N', "Locked" TEXT DEFAULT 'N',
  PRIMARY KEY ("ItemCode", "WhsCode")
);

CREATE TABLE "OCRD" (
  "CardCode" TEXT PRIMARY KEY, "CardName" TEXT, "CardType" TEXT,
  "GroupCode" INTEGER, "Currency" TEXT DEFAULT 'KRW',
  "Phone1" TEXT, "Cellular" TEXT, "E_Mail" TEXT, "CntctPrsn" TEXT, "Address" TEXT,
  "SlpCode" INTEGER DEFAULT -1, "Balance" REAL DEFAULT 0, "validFor" TEXT DEFAULT 'Y'
);
CREATE TABLE "OCRG" ("GroupCode" INTEGER PRIMARY KEY, "GroupName" TEXT);
CREATE TABLE "CRD1" (
  "CardCode" TEXT, "AdresType" TEXT, "Address" TEXT,
  "Street" TEXT, "City" TEXT, "ZipCode" TEXT, "Country" TEXT
);

CREATE TABLE "OSLP" ("SlpCode" INTEGER PRIMARY KEY, "SlpName" TEXT);
CREATE TABLE "OWHS" ("WhsCode" TEXT PRIMARY KEY, "WhsName" TEXT, "Locked" TEXT DEFAULT 'N', "Inactive" TEXT DEFAULT 'N');
CREATE TABLE "OBPL" ("BPLId" INTEGER PRIMARY KEY, "BPLName" TEXT, "Disabled" TEXT DEFAULT 'N');
CREATE TABLE "OCTG" ("GroupNum" INTEGER PRIMARY KEY, "PymntGroup" TEXT);
CREATE TABLE "OPRC" ("PrcCode" TEXT PRIMARY KEY, "PrcName" TEXT, "Active" TEXT DEFAULT 'Y', "DimCode" INTEGER DEFAULT 1, "U_DIRECTYN" TEXT);
CREATE TABLE "OOCR" ("OcrCode" TEXT PRIMARY KEY, "OcrName" TEXT, "DimCode" INTEGER DEFAULT 1);
CREATE TABLE "OCRN" ("CurrCode" TEXT PRIMARY KEY, "CurrName" TEXT);
CREATE TABLE "OVTG" ("Code" TEXT PRIMARY KEY, "Name" TEXT, "Rate" REAL DEFAULT 0, "Category" TEXT, "Inactive" TEXT);
CREATE TABLE "OHEM" ("empID" INTEGER PRIMARY KEY, "firstName" TEXT, "lastName" TEXT, "Active" TEXT DEFAULT 'Y');
CREATE TABLE "CUFD" ("TableID" TEXT, "AliasID" TEXT, "Descr" TEXT, "TypeID" TEXT);

-- 재고이동 원장 (items 상세 최근이력 + CF_W5000 Gubun='J')
CREATE TABLE "OINM" (
  "TransSeq"   INTEGER PRIMARY KEY AUTOINCREMENT,
  "ItemCode"   TEXT,
  "DocDate"    TEXT,
  "DocTime"    INTEGER DEFAULT 900,
  "TransType"  INTEGER,
  "InQty"      REAL DEFAULT 0,
  "OutQty"     REAL DEFAULT 0,
  "Warehouse"  TEXT,
  "CreatedBy"  INTEGER,
  "DocLineNum" INTEGER,
  "CardCode"   TEXT,
  "CardName"   TEXT,
  "Comments"   TEXT,
  "OcrCode"    TEXT
);
CREATE INDEX "idx_oinm_item" ON "OINM" ("ItemCode", "DocDate");

-- 분개장 (대시보드 최근 트랜잭션)
CREATE TABLE "OJDT" ("TransId" INTEGER PRIMARY KEY, "RefDate" TEXT, "TransType" INTEGER, "LocTotal" REAL DEFAULT 0, "Memo" TEXT);
`;

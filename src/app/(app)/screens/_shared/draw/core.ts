import "server-only";

/**
 * 문서연결(draw) 서버 코어 — 상위문서 미납/미청구 조회 + SL 생성/취소(범용).
 * 각 문서 actions.ts 가 DrawConfig(서버측 상수)를 넘겨 호출. 표명은 하드코딩 설정이나 방어적 검증.
 * (rules.md [★DRY-공통함수화]) 쓰기는 SL createFromBase/cancelDocument 경유만.
 */
import { query } from "@/lib/db/hana";
import { createFromBase, cancelDocument } from "@/lib/sl/documents";
import { getSession } from "@/lib/auth/session";
import type { OpenBaseDoc, OpenBaseLine, SavePayload, SaveResult, CancelResult } from "./types";

const IDENT = /^[A-Za-z0-9_]+$/;

/** 문서연결 서버 설정 — 클라에서 주입 금지(각 문서 config.ts 의 서버측 상수). */
export type DrawConfig = {
  /** 대상 SL 엔티티 (DeliveryNotes/Invoices/PurchaseDeliveryNotes/PurchaseInvoices) */
  entity: string;
  /** 상위문서 BaseType (17=판매오더, 15=납품, 22=구매오더, 20=입고) */
  baseType: number;
  /** 상위문서 헤더 테이블 (ORDR/ODLN/OPOR/OPDN) */
  baseHeaderTable: string;
  /** 상위문서 라인 테이블 (RDR1/DLN1/POR1/PDN1) */
  baseLineTable: string;
  /** 취소 상태가드용 대상 헤더 테이블 (ODLN/OINV/OPDN/OPCH) */
  targetStatusTable: string;
};

/** 미납/미청구 라인이 있는 열린 상위문서 목록 (가져오기 모달). cardCode 지정 시 그 거래처만. */
export async function listOpenBaseDocs(cfg: DrawConfig, cardCode?: string): Promise<OpenBaseDoc[]> {
  if (!IDENT.test(cfg.baseHeaderTable) || !IDENT.test(cfg.baseLineTable)) return [];
  const where = [`o."DocStatus"='O'`, `o."CANCELED"='N'`, `l."LineStatus"='O'`, `l."OpenQty">0`];
  const params: (string | number)[] = [];
  if (cardCode) {
    where.push(`o."CardCode" = ?`);
    params.push(cardCode);
  }
  return query<OpenBaseDoc>(
    `SELECT o."DocEntry" AS "docEntry", o."DocNum" AS "docNum",
            o."CardCode" AS "cardCode", o."CardName" AS "cardName",
            TO_VARCHAR(o."DocDate",'YYYY-MM-DD') AS "docDate", o."DocCur" AS "docCur",
            SUM(l."OpenQty" * l."Price") AS "openTotal"
     FROM "${cfg.baseHeaderTable}" o JOIN "${cfg.baseLineTable}" l ON l."DocEntry" = o."DocEntry"
     WHERE ${where.join(" AND ")}
     GROUP BY o."DocEntry", o."DocNum", o."CardCode", o."CardName", o."DocDate", o."DocCur"
     ORDER BY o."DocEntry" DESC`,
    params,
  );
}

type BaseHeader = { docEntry: number; docNum: number; cardCode: string; cardName: string; docCur: string | null };

/** 특정 상위문서의 헤더 + 미납/미청구 라인 (draw 대상). */
export async function loadBaseOpenLines(
  cfg: DrawConfig,
  docEntry: number,
): Promise<{ header: BaseHeader | null; lines: OpenBaseLine[] }> {
  if (!IDENT.test(cfg.baseHeaderTable) || !IDENT.test(cfg.baseLineTable)) return { header: null, lines: [] };
  const hs = await query<BaseHeader>(
    `SELECT o."DocEntry" AS "docEntry", o."DocNum" AS "docNum",
            o."CardCode" AS "cardCode", o."CardName" AS "cardName", o."DocCur" AS "docCur"
     FROM "${cfg.baseHeaderTable}" o WHERE o."DocEntry" = ? AND o."DocStatus"='O' AND o."CANCELED"='N'`,
    [docEntry],
  );
  const header = hs[0] ?? null;
  if (!header) return { header: null, lines: [] };
  const lines = await query<OpenBaseLine>(
    `SELECT l."DocEntry" AS "baseEntry", l."LineNum" AS "baseLine", l."ItemCode" AS "itemCode",
            l."Dscription" AS "itemName", l."Quantity" AS "baseQty", l."OpenQty" AS "openQty",
            l."Price" AS "price", l."WhsCode" AS "whsCode", w."WhsName" AS "whsName"
     FROM "${cfg.baseLineTable}" l LEFT JOIN "OWHS" w ON w."WhsCode" = l."WhsCode"
     WHERE l."DocEntry" = ? AND l."LineStatus"='O' AND l."OpenQty" > 0
     ORDER BY l."LineNum"`,
    [docEntry],
  );
  return { header, lines };
}

/** 문서연결 생성 (상위문서 라인 참조 → 하위문서). 세션·라인 검증 후 SL createFromBase. */
export async function createDraw(cfg: DrawConfig, p: SavePayload): Promise<SaveResult> {
  if (!(await getSession())) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (!p.cardCode) return { ok: false, error: "가져오기로 상위문서를 먼저 선택하세요." };
  const lines = p.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "이월할 라인(수량>0)이 없습니다." };
  try {
    const res = await createFromBase({
      entity: cfg.entity,
      CardCode: p.cardCode,
      DocDate: p.docDate || undefined,
      DocDueDate: p.docDueDate || undefined,
      NumAtCard: p.numAtCard || undefined,
      comments: p.comments || undefined,
      udf: p.udf, // 헤더 UDF
      lines: lines.map((l) => ({
        BaseType: cfg.baseType,
        BaseEntry: l.baseEntry,
        BaseLine: l.baseLine,
        Quantity: l.quantity,
        udf: l.udf, // 라인 UDF (상세에서 켠 라인 컬럼)
      })),
    });
    return { ok: true, docEntry: res.DocEntry, docNum: res.DocNum };
  } catch (e) {
    // SL 업무규칙 에러(재고부족·전기기간·통화 등) 그대로 노출
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 문서연결 대상문서 취소 — 상태가드(취소/마감 차단) 후 {entity}(id)/Cancel. */
export async function cancelDraw(cfg: DrawConfig, docEntry: number): Promise<CancelResult> {
  if (!(await getSession())) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (!IDENT.test(cfg.targetStatusTable)) return { ok: false, error: "설정 오류(테이블명)" };
  try {
    const rows = await query<{ CANCELED: string; DocStatus: string }>(
      `SELECT "CANCELED", "DocStatus" FROM "${cfg.targetStatusTable}" WHERE "DocEntry" = ?`,
      [docEntry],
    );
    const st = rows[0];
    if (!st) return { ok: false, error: "문서를 찾을 수 없습니다." };
    if (st.CANCELED === "Y") return { ok: false, error: "이미 취소된 문서입니다." };
    if (st.DocStatus === "C") return { ok: false, error: "닫힌(마감) 문서는 취소할 수 없습니다. (후속 문서 확인)" };
    await cancelDocument(cfg.entity, docEntry);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

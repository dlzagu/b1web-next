/**
 * 쓰기 게이트웨이 (서버 전용 — 클라이언트 컴포넌트에서 import 금지)
 *
 * 포트폴리오 전환 전에는 SAP Service Layer(REST/OData) 클라이언트였다.
 * 지금은 같은 자리에서 **로컬 ERP 엔진**(./localErp)이 데모 SQLite 에 기록한다.
 * 상위 계층(documents.ts·각 화면 actions.ts)의 계약은 그대로다 —
 * 업무규칙 위반은 여전히 예외로 던지고, 화면이 그 메시지를 사용자에게 그대로 보여준다.
 *
 * 설계:
 * - 쓰기는 이 통로만 (표준 테이블 직접 DML 금지 — CLAUDE.md)
 * - 취소는 삭제가 아니라 취소 마킹 + 후속문서 가드
 * - 생성은 멱등이 아님 → 호출부는 모호한 실패 시 재시도 금지
 */
import "server-only";
import { erpHealthCheck } from "./localErp";

/** 업무규칙 위반 — Service Layer 에러에 대응 (화면이 message 를 그대로 노출) */
export class ServiceLayerError extends Error {
  constructor(
    public readonly status: number,
    public readonly slCode: number | string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ServiceLayerError";
  }
}

/** 헬스체크용 — 쓰기 엔진 상태 */
export async function slHealthCheck(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return erpHealthCheck();
}

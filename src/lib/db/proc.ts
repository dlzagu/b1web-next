/**
 * CF_* 조회 프로시저 호출 헬퍼 (서버 전용).
 *
 * ★ 레거시 치명 안티패턴 미계승 (pilot-screens.md §C1):
 *   레거시는 클라이언트가 PROCNAME을 넘겨 임의 프로시저를 실행했다(임의실행 취약점).
 *   여기선 서버측 화이트리스트(PROC_WHITELIST)에 등록된 프로시저만 호출 가능.
 *   프로시저명은 절대 사용자 입력에서 오지 않는다 — 화면 코드가 상수로 지정.
 */
import "server-only";
import { query } from "./hana";

/** 화면이 호출을 허용하는 조회 프로시저 (조회용 CF_*만). 새 화면 추가 시 여기 등록. */
const PROC_WHITELIST = new Set<string>([
  "CF_W5000", // 재고현황 (W5070)
  "CF_W3061", // 문서/현황 계열 (W32010 등)
]);

export type ProcArg = string | number | null;

/** 화이트리스트 프로시저를 위치 인자로 CALL. name은 반드시 코드 상수. */
export async function callProc<T = Record<string, unknown>>(name: string, args: ProcArg[]): Promise<T[]> {
  if (!PROC_WHITELIST.has(name)) {
    throw new Error(`허용되지 않은 프로시저: ${name} (PROC_WHITELIST 등록 필요)`);
  }
  const placeholders = args.map(() => "?").join(",");
  // name은 화이트리스트를 통과한 상수 → 식별자 인라인 안전. 값은 파라미터 바인딩.
  return query<T>(`CALL "${name}"(${placeholders})`, args);
}

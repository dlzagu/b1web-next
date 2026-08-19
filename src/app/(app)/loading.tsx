/**
 * 인증 영역 공통 로딩 스켈레톤.
 *
 * 🔴 이게 없으면 화면 전환 중 **아무 일도 안 일어난 것처럼 보인다.** 서버 컴포넌트가
 *    데이터를 받아올 때까지 이전 화면이 그대로 멈춰 있기 때문이다. 로컬 파일 DB 일 땐
 *    수십 ms 라 티가 안 났는데, 공유 DB(원격)로 바꾸면서 쿼리마다 네트워크 왕복이 붙어
 *    체감이 커졌다(사용자 피드백: "로딩 UI 가 없어서 헷갈린다").
 *
 * 레이아웃(헤더·사이드바)은 유지되고 <main> 안쪽만 이걸로 바뀐다 — 그래서 화면 전체가
 * 깜빡이지 않고 '내용만 준비 중'이라는 게 드러난다.
 */
function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded bg-surface-2 ${className}`} style={style} />;
}

/** 그리드 열 너비(px) — 실제 표와 비슷한 리듬을 만들어 '자리가 잡혀 있다'는 인상을 준다 */
const COL_WIDTHS = [120, 200, 90, 90, 110];

export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="불러오는 중">
      {/* 페이지 제목 */}
      <Bar className="mb-3 h-7 w-56" />
      <Bar className="mb-6 h-4 w-80 opacity-70" />

      {/* 검색 조건 카드 */}
      <div className="mb-4 rounded-card bg-surface-container p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Bar className="mb-2 h-3 w-16 opacity-70" />
              <Bar className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* 그리드 */}
      <div className="overflow-hidden rounded-card bg-surface-container">
        <div className="flex gap-4 border-b border-border-subtle px-4 py-3">
          {COL_WIDTHS.map((w, i) => (
            // key 는 인덱스로 — 너비 값에는 중복(90)이 있어 key 로 쓰면 React 가 경고한다
            <Bar key={i} className="h-4" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {COL_WIDTHS.map((w, i) => (
              <Bar key={i} className="h-3.5 opacity-60" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}

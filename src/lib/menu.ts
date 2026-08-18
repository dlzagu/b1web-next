/**
 * 메뉴 트리 — 코드 정의. 레거시는 DB(*_WEB_ADMIN)에서 메뉴를 읽지만,
 * 신규는 화면을 코드로 고정. (추후 DB 메뉴/권한 연동)
 *
 * 구조(2026-07-06 정리): 업무 도메인별 6그룹. "레퍼런스·" 내부 접두사 제거.
 * - ready=false = 아직 미구현(사이드바에 '준비중' 표시).
 * - hidden=true = 라우트는 살아있으나 메뉴에 노출 안 함(중복 화면 정리용).
 *   중복(품목·거래처·창고재고)은 대표 1개만 노출하고 나머지는 hidden. href는 서버 화이트리스트로도 쓰임.
 */
export type MenuItem = { id: string; label: string; href: string; ready: boolean; hidden?: boolean; note?: string };
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

export const MENU: MenuGroup[] = [
  {
    id: "base",
    label: "기준정보",
    items: [
      { id: "items", label: "품목 조회", href: "/screens/items", ready: true, note: "OITM 직접 SELECT" },
      { id: "partners", label: "거래처 조회", href: "/screens/partners", ready: true, note: "OCRD 직접 SELECT" },
      // 숨김(중복) — 라우트 유지, 메뉴 미노출
      { id: "W3110", label: "품목 마스터(구)", href: "/screens/W3110", ready: true, hidden: true, note: "OITM 재구성(중복 → items 대표)" },
      { id: "W3120", label: "거래처 마스터(구)", href: "/screens/W3120", ready: true, hidden: true, note: "OCRD 재구성(중복 → partners 대표)" },
    ],
  },
  {
    id: "sales",
    label: "판매",
    items: [
      // 판매오더(ORDR) — 조회+생성/수정/취소(SL) 정식 화면. 사용자 확정: 판매오더를 실제 사용(2026-07-10).
      { id: "orders", label: "판매오더", href: "/screens/orders", ready: true, note: "ORDR 판매오더 — 조회+CUD(SL). 생성은 목록 [신규]" },
      { id: "W3071", label: "수주 진행 현황", href: "/screens/W3071", ready: true, note: "ORDR→ODLN→OINV 체인 롤업 — 거래처집계 + 오더라인 상세" },
      { id: "orders-new", label: "판매오더 입력", href: "/screens/orders/new", ready: true, hidden: true, note: "목록 [신규] 버튼으로 진입(메뉴 숨김)" },
      { id: "deliveries", label: "납품 현황", href: "/screens/deliveries", ready: true, note: "ODLN" },
      { id: "invoices", label: "매출 세금계산서", href: "/screens/invoices", ready: true, note: "OINV" },
      // W3030 '수주 목록(구)'은 실제 OINV(세금계산서) 조회 — 매출 세금계산서(invoices)와 소스 중복.
      // 사용자 결정(2026-07-10): 메뉴 숨김. 라우트는 유지(추후 '매출 실적 현황'으로 재명명 시 부활 가능).
      { id: "W3030", label: "수주 목록(구)", href: "/screens/W3030", ready: true, hidden: true, note: "OINV 기반. 숨김(invoices와 중복) — 2026-07-10 사용자 결정" },
    ],
  },
  // 구매 그룹 활성(2026-07-10 사용자 요청): 구매오더(OPOR)·구매입고(OPDN)·매입세금계산서(OPCH) 조회+상세.
  {
    id: "purchase",
    label: "구매",
    items: [
      { id: "purchase-orders", label: "구매오더", href: "/screens/purchase-orders", ready: true, note: "OPOR" },
      { id: "purchase-deliveries", label: "구매입고", href: "/screens/purchase-deliveries", ready: true, note: "OPDN (GRPO)" },
      { id: "purchase-invoices", label: "매입 세금계산서", href: "/screens/purchase-invoices", ready: true, note: "OPCH" },
    ],
  },
  {
    id: "inventory",
    label: "재고",
    items: [
      { id: "W5070", label: "창고 재고 조회", href: "/screens/W5070", ready: true, note: "CF_W5000 Gubun=W" },
      { id: "W5071", label: "재고 입출고 대장", href: "/screens/W5071", ready: true, note: "OINM 원장 집계 — 월별/주별 피벗(이월·입고·출고·재고)" },
      { id: "W5030", label: "창고 이전 요청", href: "/screens/W5030", ready: true, note: "OWTQ" },
      { id: "W5060", label: "재고 이동 내역", href: "/screens/W5060", ready: true, note: "CF_W5000 Gubun=J (OINM)" },
      // 숨김(중복)
      { id: "W3130", label: "창고 재고 요약", href: "/screens/W3130", ready: true, hidden: true, note: "OITW 재구성(중복 → W5070 대표)" },
    ],
  },
  {
    id: "sales-analysis",
    label: "매출 분석",
    items: [
      { id: "W3040", label: "거래처별 매출 분석", href: "/screens/W3040", ready: true, note: "거래처 GROUP BY 집계" },
      { id: "W3050", label: "품목별 매출 분석", href: "/screens/W3050", ready: true, note: "품목 GROUP BY 집계" },
      { id: "W3060", label: "월별 매출 추이", href: "/screens/W3060", ready: true, note: "월별 집계" },
      { id: "W3070", label: "일자별 매출 집계", href: "/screens/W3070", ready: true, note: "일자별 집계(CF_W3070 버그 미재현)" },
      { id: "W3080", label: "매출 누계 추이", href: "/screens/W3080", ready: true, note: "월별 누적" },
      { id: "W3090", label: "거래처 매출 누계", href: "/screens/W3090", ready: true, note: "거래처 GROUP BY" },
      { id: "W3100", label: "일일 업무 요약", href: "/screens/W3100", ready: true, note: "일자별 문서 크로스" },
    ],
  },
  {
    id: "system",
    label: "시스템",
    items: [{ id: "health", label: "헬스체크", href: "/health", ready: true }],
  },
];

/** ready=true 화면 href 화이트리스트 (hidden 포함 — 라우트/메뉴 정합용) */
export const READY_HREFS = new Set(MENU.flatMap((g) => g.items).filter((i) => i.ready).map((i) => i.href));

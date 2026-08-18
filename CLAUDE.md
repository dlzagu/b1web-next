@AGENTS.md

# B1WEB-Next — 프로젝트 헌법

## 이 프로젝트가 뭔가
브라우저만으로 판매·구매·재고 업무를 처리하는 웹 SCM/ERP **포트폴리오 사이드 프로젝트**.
SAP B1 데이터 모델(표준 테이블·문서연결 규칙)을 따르고, 데이터는 자체 SQLite + **전부 가상 시드**다.
실서버(Service Layer·HANA) 연결은 없다.
- 원본(참조 전용, 로컬에만 존재) — **절대 수정 금지**
- 전환 결정 기록: `docs/decisions/ADR-0001-portfolio-sqlite.md`

## 절대 규칙 (위반 시 작업 중단)
- 🔒 **실데이터·실명 반입 금지** — 실고객사·실서버 좌표·실측 상호/품목명을 코드·시드·문서에 넣지 않는다. 공개 배포되는 저장소다.
- 🚫 원본 참조 폴더 수정 금지 (읽기 전용). 내용·경로·사명을 이 저장소로 복사하지 않는다.
- 📖 Next.js 코드 작성 전 `node_modules/next/dist/docs/` 관련 가이드 확인 (@AGENTS.md — 학습데이터와 다른 버전).
- 💾 **쓰기는 ERP 엔진 경유만** (`src/lib/sl/`) — 화면·액션에서 표준 테이블 직접 INSERT/UPDATE 금지.
- 🔍 **조회는 read-only 게이트웨이 경유만** (`src/lib/db/hana.ts`) — SELECT/WITH/CALL 외 차단.
- ✅ "done" = `npm run verify` (lint → typecheck → smoke) + `npm run build` 통과.
- 📌 이터레이션(작업 단위)마다 git commit — 롤백 지점.

## 데이터 계층 (전환 후)
- **조회**: `src/lib/db/hana.ts`(게이트웨이) → `src/lib/db/sqlite.ts`(HANA 호환 계층: TO_VARCHAR·TO_DECIMAL·DAYS_BETWEEN 커스텀 함수 + `SELECT TOP`→`LIMIT` 재작성).
  화면 쿼리는 **HANA 문법 그대로** 쓴다 — 어댑터가 흡수하므로 고치지 않는다.
- **프로시저**: `src/lib/db/procImpl.ts` — `CF_W5000`(Gubun W/J)을 결과셋 계약 그대로 TS 재구현.
  ⚠️ W5060 계약상 수량 컬럼은 **콤마 포맷 문자열**이고 소계행은 `DOCENTRY=''` 다.
- **쓰기**: `src/lib/sl/documents.ts`(SL 계약 타입 유지) → `src/lib/sl/localErp.ts`(엔진).
  문서연결·미결수량·재고원장·분개·취소 복원이 여기 한 곳에 있다.
- **시드**: `src/lib/db/demo-seed/` — 문서를 SQL 로 꽂지 않고 **엔진을 통해 생성**해 불변식을 구성으로 보장한다.

## SAP B1 도메인 규칙 (시드·엔진이 지키는 것)
- 상태 이원: `DocStatus` O/C · `CANCELED` Y/N — 표시 우선순위는 **취소 > 상태**.
- 목록 기본은 취소건 숨김(`COALESCE(CANCELED,'N') <> 'Y'`), 분석 리포트는 항상 `CANCELED='N'`.
- 문서연결: 자식라인 `BaseType`(17판매오더·15납품·13AR송장·22구매오더·20입고·18AP송장)/`BaseEntry`/`BaseLine`.
- 이월 가능 = 헤더 `DocStatus='O' AND CANCELED='N'` **AND** 라인 `LineStatus='O' AND OpenQty>0`.
- B1 명명: `O<X>`=헤더/마스터, `<X>1`=라인, `U_`=커스텀 필드.

## 아키텍처 원칙
- UI: Tailwind 기본. **화면은 반드시 공통 래퍼(`src/components/erp/` — SearchBar·DataGrid·PageHeader 등) 경유** — 디자인 시스템 교체 경계.
- 화면 추가는 템플릿 복제 패턴으로 (조회 화면 = 검색조건 + 그리드 + 액션).

## 진행 추적
- `docs/progress/goal1.json` — 세션 시작 시 Read → 다음 pending step부터. (로컬 전용, 저장소 미포함)

## 명령어
- `npm run dev` / `npm run verify` / `npm run build` / `npm run smoke` / `npm run db:reset`

/**
 * 시드 말뭉치 — **전부 가상이다.** 회사·거래처·품목·인물 어느 것도 실존하지 않는다.
 * 포트폴리오 데모 목적의 창작 데이터 (사무용품 유통사 시나리오).
 */

export const COMPANY_NAME = "(주)미도상사";
/** 데모 회사 코드 — 로그인 세션의 corp 표시용 (구 SL_COMPANY_DB 대체) */
export const COMPANY_DB = "MIDO01KO_DEMO";

export const BRANCHES = [
  { id: 1, name: "본사" },
  { id: 2, name: "부산지사" },
];

export const WAREHOUSES = [
  { code: "W1000", name: "본사창고" },
  { code: "W2000", name: "물류센터" },
  { code: "W3000", name: "반품창고" },
];

export const COST_CENTERS = [
  { code: "210001", name: "영업1팀", direct: "D" },
  { code: "210002", name: "영업2팀", direct: "D" },
  { code: "220001", name: "경영지원", direct: "I" },
];

export const CURRENCIES = [
  { code: "KRW", name: "원" },
  { code: "USD", name: "미국 달러" },
];

export const VAT_GROUPS = [
  { code: "A8", name: "과세매출(세금계산서)", rate: 10, category: "O" },
  { code: "A0", name: "면세매출", rate: 0, category: "O" },
  { code: "V2", name: "과세매입", rate: 10, category: "I" },
  { code: "V0", name: "면세매입", rate: 0, category: "I" },
];

export const PAYMENT_TERMS = [
  { num: 1, name: "현금 결제" },
  { num: 2, name: "월말 기준 30일" },
  { num: 3, name: "월말 기준 60일" },
];

export const SALES_EMPLOYEES = [
  { code: -1, name: "-미지정-" },
  { code: 1, name: "김성호" },
  { code: 2, name: "이가람" },
  { code: 3, name: "박도윤" },
];

export const EMPLOYEES = [
  { id: 1, first: "성호", last: "김" },
  { id: 2, first: "가람", last: "이" },
  { id: 3, first: "도윤", last: "박" },
  { id: 4, first: "지우", last: "한" },
];

export const BP_GROUPS = [
  { code: 100, name: "국내 도매" },
  { code: 110, name: "온라인몰" },
  { code: 120, name: "직영점" },
  { code: 200, name: "공급처" },
];

export const ITEM_GROUPS = [
  { code: 100, name: "필기구" },
  { code: 110, name: "지류" },
  { code: 120, name: "사무용품" },
  { code: 130, name: "전산소모품" },
];

export interface SeedItem {
  code: string;
  name: string;
  group: number;
  gr1: string;
  price: number;
  firm: string;
  vendor: string;
}

export const ITEMS: SeedItem[] = [
  {
    code: "ST-1001",
    name: "젤펜 0.5mm 흑",
    group: 100,
    gr1: "필기구",
    price: 800,
    firm: "한올펜",
    vendor: "V20001",
  },
  {
    code: "ST-1002",
    name: "젤펜 0.5mm 청",
    group: 100,
    gr1: "필기구",
    price: 800,
    firm: "한올펜",
    vendor: "V20001",
  },
  {
    code: "ST-1003",
    name: "형광펜 5색 세트",
    group: 100,
    gr1: "필기구",
    price: 3200,
    firm: "한올펜",
    vendor: "V20001",
  },
  {
    code: "ST-1004",
    name: "화이트보드마커 흑",
    group: 100,
    gr1: "필기구",
    price: 1200,
    firm: "한올펜",
    vendor: "V20001",
  },
  {
    code: "ST-1005",
    name: "수정테이프 5mm",
    group: 100,
    gr1: "필기구",
    price: 1500,
    firm: "두리문구",
    vendor: "V20001",
  },
  {
    code: "PA-2001",
    name: "A4 복사용지 80g 500매",
    group: 110,
    gr1: "지류",
    price: 4500,
    firm: "한솔지업",
    vendor: "V20002",
  },
  {
    code: "PA-2002",
    name: "A3 복사용지 80g 500매",
    group: 110,
    gr1: "지류",
    price: 8900,
    firm: "한솔지업",
    vendor: "V20002",
  },
  {
    code: "PA-2003",
    name: "포스트잇 76x76 노랑",
    group: 110,
    gr1: "지류",
    price: 1800,
    firm: "두리문구",
    vendor: "V20002",
  },
  {
    code: "PA-2004",
    name: "라벨지 A4 20칸 100매",
    group: 110,
    gr1: "지류",
    price: 9800,
    firm: "한솔지업",
    vendor: "V20002",
  },
  {
    code: "PA-2005",
    name: "클리어파일 A4 20매",
    group: 110,
    gr1: "지류",
    price: 2500,
    firm: "두리문구",
    vendor: "V20002",
  },
  {
    code: "OF-3001",
    name: "스테이플러 33호",
    group: 120,
    gr1: "사무용품",
    price: 6500,
    firm: "오피스원",
    vendor: "V20004",
  },
  {
    code: "OF-3002",
    name: "스테이플러침 33호 5000pcs",
    group: 120,
    gr1: "사무용품",
    price: 1100,
    firm: "오피스원",
    vendor: "V20004",
  },
  {
    code: "OF-3003",
    name: "가위 175mm",
    group: 120,
    gr1: "사무용품",
    price: 2800,
    firm: "오피스원",
    vendor: "V20004",
  },
  {
    code: "OF-3004",
    name: "커터칼 대형",
    group: 120,
    gr1: "사무용품",
    price: 1900,
    firm: "오피스원",
    vendor: "V20004",
  },
  {
    code: "OF-3005",
    name: "링바인더 3공 A4",
    group: 120,
    gr1: "사무용품",
    price: 4200,
    firm: "두리문구",
    vendor: "V20004",
  },
  {
    code: "OF-3006",
    name: "데스크 오거나이저",
    group: 120,
    gr1: "사무용품",
    price: 12000,
    firm: "오피스원",
    vendor: "V20004",
  },
  {
    code: "OF-3007",
    name: "제도샤프 0.5mm",
    group: 120,
    gr1: "사무용품",
    price: 5400,
    firm: "한올펜",
    vendor: "V20001",
  },
  {
    code: "IT-4001",
    name: "무선 마우스",
    group: 130,
    gr1: "전산소모품",
    price: 15000,
    firm: "테크노바",
    vendor: "V20003",
  },
  {
    code: "IT-4002",
    name: "유선 키보드",
    group: 130,
    gr1: "전산소모품",
    price: 18000,
    firm: "테크노바",
    vendor: "V20003",
  },
  {
    code: "IT-4003",
    name: "USB 허브 4포트",
    group: 130,
    gr1: "전산소모품",
    price: 9900,
    firm: "테크노바",
    vendor: "V20003",
  },
  {
    code: "IT-4004",
    name: "건전지 AA 10입",
    group: 130,
    gr1: "전산소모품",
    price: 5500,
    firm: "누리전지",
    vendor: "V20005",
  },
  {
    code: "IT-4005",
    name: "모니터 받침대",
    group: 130,
    gr1: "전산소모품",
    price: 21000,
    firm: "테크노바",
    vendor: "V20003",
  },
  {
    code: "IT-4006",
    name: "노트북 거치대",
    group: 130,
    gr1: "전산소모품",
    price: 25000,
    firm: "테크노바",
    vendor: "V20003",
  },
  {
    code: "IT-4007",
    name: "토너 카트리지 흑",
    group: 130,
    gr1: "전산소모품",
    price: 68000,
    firm: "테크노바",
    vendor: "V20003",
  },
];

export interface SeedBp {
  code: string;
  name: string;
  type: "C" | "S";
  group: number;
  slp: number;
  city: string;
  contact: string;
}

/** 고객사 (전부 가상) */
export const CUSTOMERS: SeedBp[] = [
  {
    code: "C10001",
    name: "한솔문구유통",
    type: "C",
    group: 100,
    slp: 1,
    city: "서울",
    contact: "강민재",
  },
  {
    code: "C10002",
    name: "미래오피스",
    type: "C",
    group: 100,
    slp: 1,
    city: "인천",
    contact: "조유리",
  },
  {
    code: "C10003",
    name: "청람서점",
    type: "C",
    group: 100,
    slp: 2,
    city: "대전",
    contact: "임태윤",
  },
  {
    code: "C10004",
    name: "(주)오름마트",
    type: "C",
    group: 120,
    slp: 2,
    city: "부산",
    contact: "황서진",
  },
  {
    code: "C10005",
    name: "드림스테이셔너리",
    type: "C",
    group: 110,
    slp: 3,
    city: "서울",
    contact: "박하늘",
  },
  {
    code: "C10006",
    name: "새벽유통",
    type: "C",
    group: 100,
    slp: 3,
    city: "광주",
    contact: "정우빈",
  },
  {
    code: "C10007",
    name: "가람문구센터",
    type: "C",
    group: 100,
    slp: 1,
    city: "대구",
    contact: "송예린",
  },
  {
    code: "C10008",
    name: "온소프트몰",
    type: "C",
    group: 110,
    slp: 2,
    city: "서울",
    contact: "차민서",
  },
];

/** 공급처 (전부 가상) */
export const VENDORS: SeedBp[] = [
  {
    code: "V20001",
    name: "한올펜공업",
    type: "S",
    group: 200,
    slp: -1,
    city: "안산",
    contact: "노석현",
  },
  {
    code: "V20002",
    name: "한솔지업사",
    type: "S",
    group: 200,
    slp: -1,
    city: "평택",
    contact: "배지원",
  },
  {
    code: "V20003",
    name: "(주)테크노바",
    type: "S",
    group: 200,
    slp: -1,
    city: "성남",
    contact: "유하람",
  },
  {
    code: "V20004",
    name: "오피스원산업",
    type: "S",
    group: 200,
    slp: -1,
    city: "김포",
    contact: "권도현",
  },
  {
    code: "V20005",
    name: "누리전지상사",
    type: "S",
    group: 200,
    slp: -1,
    city: "청주",
    contact: "문세아",
  },
];

/** CUFD 동적 UDF 정의 — 생성폼·상세의 UDF 데모 (실컬럼은 schema.ts 에 존재) */
export const UDF_DEFS = [
  { table: "ORDR", alias: "PJT", label: "프로젝트", type: "A" },
  { table: "RDR1", alias: "Memo", label: "라인메모", type: "A" },
  { table: "OPOR", alias: "PJT", label: "프로젝트", type: "A" },
  { table: "POR1", alias: "Memo", label: "라인메모", type: "A" },
];

export const ORDER_COMMENTS = [
  "정기 발주 건입니다.",
  "긴급 — 금주 내 납품 요청.",
  "신학기 프로모션 물량.",
  "재고 보충 발주.",
  "",
  "",
];

export const PROJECT_NAMES = ["신학기전", "본사비품", "온라인프로모션", ""];

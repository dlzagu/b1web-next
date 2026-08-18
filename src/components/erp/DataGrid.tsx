/**
 * DataGrid — ERP 목록/그리드 공통 래퍼 (서버 컴포넌트, 프레젠테이셔널 어댑터).
 * 역할: 컬럼의 render 콜백을 서버에서 실행해 셀 노드를 만들고, 정렬용 원시값(v)을 함께 계산한 뒤
 *       인터랙티브 클라 그리드(DataTableClient)에 직렬화 가능한 형태로 넘긴다.
 *  → 화면(page.tsx)의 컬럼 정의는 종전 그대로. 헤더 클릭 정렬은 공통으로 자동 적용.
 *  → 함수 prop(render/getRowKey/sortValue)은 여기(서버)에서만 실행 → RSC 경계 안전.
 *
 * 피벗 리포트 지원(2026-08-18, W5071 재고 수불부): group / frozen / total 3종 컬럼 옵션 추가.
 * 전부 optional 이라 기존 화면은 한 줄도 바뀌지 않는다(미지정 시 종전과 동일 렌더).
 */
import type { ReactNode } from "react";
import DataTableClient, { type HeaderMeta, type RowData, type SortType } from "./DataTableClient";

export type Column<T> = {
  /** 컬럼 키 (기본 렌더/정렬 시 row[key] 사용) */
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  /** 커스텀 셀 렌더 (금액 포맷·링크·Badge 등) — 서버에서 실행됨 */
  render?: (row: T) => ReactNode;
  /** 정렬 가능 여부 (기본 true) */
  sortable?: boolean;
  /** 정렬 타입 (기본: align='right'면 number, 아니면 text) */
  sortType?: SortType;
  /** 정렬/필터용 값 오버라이드 (서버 실행). 기본 row[key]. 예: 코드→이름 컬럼을 이름으로 정렬 */
  sortValue?: (row: T) => string | number | null | undefined;
  /** 컬럼 필터 입력칸 노출 (기본 false, filterable 그리드에서만) */
  filterable?: boolean;
  /** 컬럼 선택기에서 기본 숨김 (사용자가 켤 수 있음). storageKey 있는 그리드에서만 의미 */
  defaultHidden?: boolean;
  /** 2단 헤더 상단 그룹 라벨. 연속된 같은 값이 colSpan 으로 묶인다 (예: "1월" 아래 입고/출고/재고) */
  group?: string;
  /** 좌측 고정열 — 가로 스크롤 시 붙박이. 선두부터 연속된 frozen 컬럼만 적용된다 */
  frozen?: boolean;
  /** 하단 합계행에 이 컬럼의 열합계를 표시 (정렬값 v 기준, 컬럼 필터 결과에 연동) */
  total?: "sum";
  /** 하단 합계행에 표시할 고정 라벨 (예: 첫 컬럼의 "합계") */
  totalLabel?: string;
};

function resolveSortType<T>(c: Column<T>): SortType {
  return c.sortType ?? (c.align === "right" ? "number" : "text");
}

/** 원시 정렬값 산출 — 빈값은 undefined(정렬 시 항상 마지막) */
function toSortVal(raw: unknown, st: SortType): string | number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (st === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  if (st === "date") return String(raw).slice(0, 10);
  return String(raw);
}

export default function DataGrid<T extends Record<string, unknown>>({
  columns,
  rows,
  loading = false,
  emptyText = "데이터가 없습니다.",
  getRowKey,
  rowHref,
  pageSize,
  filterable = false,
  footer,
  storageKey,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyText?: string;
  getRowKey?: (row: T, index: number) => string | number;
  /** 지정 시 행 클릭 → 해당 URL로 이동 (상세 드릴다운). 서버 실행 → href 문자열만 클라로 전달 */
  rowHref?: (row: T) => string;
  /** 지정 시 클라 페이지네이션 활성 (미지정=전체 표시) */
  pageSize?: number;
  /** true면 컬럼 필터 입력행 표시(각 컬럼 filterable 옵트인) */
  filterable?: boolean;
  /** 합계 등 그리드 하단 고정 바 — 스크롤과 무관하게 항상 화면 안에 보임 */
  footer?: ReactNode;
  /** 지정 시 컬럼 선택기 + 뷰(표시컬럼·순서·너비) localStorage 영속화 (사용자별·화면별 키). 예: `b1w:cols:orders:<uid>` */
  storageKey?: string;
}) {
  const headers: HeaderMeta[] = columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    width: c.width,
    sortable: c.sortable !== false,
    sortType: resolveSortType(c),
    filterable: !!c.filterable,
    defaultHidden: !!c.defaultHidden,
    group: c.group,
    frozen: !!c.frozen,
    total: c.total,
    totalLabel: c.totalLabel,
  }));

  const data: RowData[] = rows.map((row, i) => ({
    key: getRowKey ? getRowKey(row, i) : i,
    href: rowHref ? rowHref(row) : undefined,
    cells: columns.map((c) => {
      const raw = c.sortValue ? c.sortValue(row) : row[c.key];
      return {
        v: toSortVal(raw, resolveSortType(c)),
        node: c.render ? c.render(row) : formatCell(row[c.key]),
      };
    }),
  }));

  return (
    <DataTableClient
      headers={headers}
      data={data}
      loading={loading}
      emptyText={emptyText}
      pageSize={pageSize}
      filterable={filterable}
      footer={footer}
      storageKey={storageKey}
    />
  );
}

function formatCell(v: unknown): ReactNode {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

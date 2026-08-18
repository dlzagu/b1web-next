"use client";

/**
 * DataTableClient — TanStack Table 기반 인터랙티브 그리드 (클라이언트).
 * 서버(DataGrid 어댑터)가 셀을 미리 렌더한 노드 + 정렬용 원시값(v)을 넘겨준다.
 *  → render 콜백은 서버에서 실행되고, 여기선 정렬/필터/페이징/컬럼이동·리사이즈만 클라에서 처리.
 * 기능: 헤더 클릭 정렬 · 컬럼 드래그 순서변경 · 컬럼 너비 리사이즈 · 스티키 헤더 · 가시영역 내 스크롤바.
 */
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnOrderState,
  type VisibilityState,
  type ColumnSizingState,
  type SortingFn,
  type FilterFn,
} from "@tanstack/react-table";
import { THead, TBody, TR, TH, TD } from "@/components/ui";
import { Button } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export type SortType = "text" | "number" | "date";
export type Align = "left" | "right" | "center";

export type HeaderMeta = {
  key: string;
  header: string;
  align?: Align;
  width?: string;
  sortable: boolean;
  sortType: SortType;
  filterable: boolean;
  /** 컬럼 선택기에서 기본 숨김(사용자가 켤 수 있음) */
  defaultHidden?: boolean;
  /** 2단 헤더 상단 그룹 라벨 — 연속된 같은 값이 colSpan 으로 묶인다 */
  group?: string;
  /** 좌측 고정열 (선두 연속 구간만 적용) */
  frozen?: boolean;
  /** 하단 합계행 열합계 표시 */
  total?: "sum";
  /** 하단 합계행 고정 라벨 */
  totalLabel?: string;
};
export type CellData = { v: string | number | undefined; node: ReactNode };
export type RowData = { key: string | number; cells: CellData[]; href?: string };

// ColumnMeta 확장 — 정렬 관련 표시
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: Align;
  }
}

const alignCls = (a?: Align) =>
  a === "right" ? "text-right tabular-nums" : a === "center" ? "text-center" : "text-left";
const justifyCls = (a?: Align) =>
  a === "right" ? "justify-end" : a === "center" ? "justify-center" : "justify-start";

const sortingFns: Record<SortType, SortingFn<RowData>> = {
  number: (a, b, id) => (a.getValue<number>(id) ?? 0) - (b.getValue<number>(id) ?? 0),
  date: (a, b, id) => {
    const av = String(a.getValue(id) ?? ""), bv = String(b.getValue(id) ?? "");
    return av < bv ? -1 : av > bv ? 1 : 0;
  },
  text: (a, b, id) => String(a.getValue(id) ?? "").localeCompare(String(b.getValue(id) ?? ""), "ko"),
};

const includesText: FilterFn<RowData> = (row, id, filterValue) =>
  String(row.getValue(id) ?? "").toLowerCase().includes(String(filterValue).toLowerCase());

function parseWidth(w?: string): number {
  const n = w ? parseInt(w, 10) : NaN;
  return Number.isFinite(n) ? n : 150;
}

function ColumnsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18" />
    </svg>
  );
}

function SortIndicator({ dir }: { dir: false | "asc" | "desc" }) {
  return (
    <span className="inline-flex flex-col leading-none -space-y-1" aria-hidden>
      <span className={cn("text-[8px]", dir === "asc" ? "text-primary" : "text-faint/50")}>▲</span>
      <span className={cn("text-[8px]", dir === "desc" ? "text-primary" : "text-faint/50")}>▼</span>
    </span>
  );
}

export default function DataTableClient({
  headers,
  data,
  loading = false,
  emptyText = "데이터가 없습니다.",
  pageSize,
  filterable = false,
  onRowSelect,
  footer,
  storageKey,
}: {
  headers: HeaderMeta[];
  data: RowData[];
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
  filterable?: boolean;
  /** 지정 시 행 클릭 → 네비게이션 대신 이 콜백(rowHref보다 우선). CFL 모달 선택 등 */
  onRowSelect?: (key: string | number) => void;
  /** 합계 등 그리드 하단 고정 바 — 스크롤과 무관하게 항상 화면 안에 보임 */
  footer?: ReactNode;
  /** 지정 시 컬럼 선택기 + 뷰(표시컬럼·순서·너비) localStorage 영속화 활성 (사용자별·화면별 키) */
  storageKey?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => headers.map((h) => h.key));
  const [dragCol, setDragCol] = useState<string | null>(null);
  // 컬럼 표시 여부 — defaultHidden 컬럼은 초기 숨김(false). 사용자가 선택기로 토글.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(headers.filter((h) => h.defaultHidden).map((h) => [h.key, false])),
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);
  // 뷰 상태(표시컬럼·순서·너비)가 어느 화면·어느 컬럼구성에 속한 것인지 나타내는 토큰.
  // storageKey 가 바뀌거나(탭 전환 등) 컬럼 집합 자체가 바뀌면(피벗 리포트의 기간 컬럼 수 변화)
  // 이전 상태를 이월하면 안 된다 — 소프트 내비게이션에서는 이 컴포넌트가 언마운트되지 않는다.
  const viewToken = `${storageKey ?? ""}|${headers.map((h) => h.key).join(",")}`;
  // 하이드레이션 완료 표시를 토큰으로 둔다(불리언 아님) — 저장 effect 가 '이번 토큰으로 로드된
  // 상태'일 때만 돌아, 키가 바뀐 커밋에서 이전 탭의 상태를 새 키에 써버리는 오염을 막는다.
  const [hydratedToken, setHydratedToken] = useState<string | null>(null);

  // 사용자별 그리드 뷰(표시컬럼·순서·너비) localStorage 영속화 — storageKey 있을 때만. DB 저장 없음, 캐시 초기화 전까지 유지.
  useEffect(() => {
    // 항상 기본값을 만든 뒤 저장분을 얹는다. 저장분이 없을 때 이전 화면/탭의 상태가 남아
    // 그대로 새 키에 저장되는 오염(컬럼순서·고정열·합계라벨 어긋남)을 막는다.
    let visibility: VisibilityState = Object.fromEntries(
      headers.filter((h) => h.defaultHidden).map((h) => [h.key, false]),
    );
    let order: string[] = headers.map((h) => h.key);
    let sizing: ColumnSizingState = {};
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const p = JSON.parse(raw) as { visibility?: VisibilityState; order?: string[]; sizing?: ColumnSizingState };
          if (p.visibility) visibility = p.visibility;
          if (p.sizing) sizing = p.sizing;
          if (p.order?.length) {
            // 저장된 순서 + 이후 추가된 새 컬럼은 뒤에 붙임(스키마 변화에 견고)
            const keys = headers.map((h) => h.key);
            const known = p.order.filter((k) => keys.includes(k));
            const missing = keys.filter((k) => !known.includes(k));
            order = [...known, ...missing];
          }
        }
      } catch {
        /* 손상된 캐시 무시 */
      }
    }
    setColumnVisibility(visibility);
    setColumnOrder(order);
    setColumnSizing(sizing);
    setHydratedToken(viewToken);
    // headers·storageKey 는 viewToken 에 압축돼 있다(매 렌더 새 배열이라 deps 직접 사용 불가)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewToken]);

  // 변경분 저장 (이번 토큰으로 하이드레이션된 뒤에만 — 기본값·이전 탭 상태로 덮어쓰기 방지)
  useEffect(() => {
    if (!storageKey || hydratedToken !== viewToken) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ visibility: columnVisibility, order: columnOrder, sizing: columnSizing }),
      );
    } catch {
      /* 용량 초과 등 무시 */
    }
  }, [storageKey, viewToken, hydratedToken, columnVisibility, columnOrder, columnSizing]);

  // 컬럼 선택 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!chooserOpen) return;
    const onDown = (e: MouseEvent) => {
      if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) setChooserOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [chooserOpen]);

  const visibleCount = headers.filter((h) => columnVisibility[h.key] !== false).length;
  const toggleCol = (key: string) =>
    setColumnVisibility((prev) => {
      const currentlyVisible = prev[key] !== false;
      if (currentlyVisible) {
        // 숨기려는 경우: 최소 1개 컬럼은 남겨야 함
        const otherVisible = headers.filter((h) => h.key !== key && prev[h.key] !== false).length;
        if (otherVisible === 0) return prev;
        return { ...prev, [key]: false };
      }
      return { ...prev, [key]: true };
    });
  const resetView = () => {
    setColumnVisibility(Object.fromEntries(headers.filter((h) => h.defaultHidden).map((h) => [h.key, false])));
    setColumnOrder(headers.map((h) => h.key));
    setColumnSizing({});
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* 무시 */
      }
    }
  };
  const paginated = typeof pageSize === "number" && pageSize > 0;
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const rowNav = (href: string) => startNav(() => router.push(href));
  const hasRowNav = !onRowSelect && data.some((r) => r.href);

  const columns = useMemo<ColumnDef<RowData>[]>(
    () =>
      headers.map((h, i) => ({
        id: h.key,
        accessorFn: (row) => row.cells[i]?.v,
        header: h.header,
        cell: (ctx) => ctx.row.original.cells[i]?.node ?? null,
        enableSorting: h.sortable,
        enableColumnFilter: h.filterable,
        sortingFn: sortingFns[h.sortType],
        sortUndefined: "last",
        filterFn: includesText,
        size: parseWidth(h.width),
        minSize: 56,
        meta: { align: h.align },
      })),
    [headers],
  );

  // TanStack Table은 내부적으로 메모이제이션을 관리 → React Compiler 스킵 경고는 안전(무시)
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnOrder, columnVisibility, columnSizing },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: paginated ? { pagination: { pageSize: pageSize!, pageIndex: 0 } } : {},
    getRowId: (row) => String(row.key),
  });

  const headerGroup = table.getHeaderGroups()[0];
  const bodyRows = table.getRowModel().rows;
  const showFilterRow = filterable && headers.some((h) => h.filterable);
  const totalWidth = table.getTotalSize();

  // ── 피벗 리포트 지원 (2026-08-18) — group/frozen/total 미지정이면 전부 비활성 = 종전 렌더 ──
  const metaByKey = useMemo(() => new Map(headers.map((h) => [h.key, h])), [headers]);
  const leafHeaders = headerGroup?.headers ?? [];

  /** 좌측 고정열 오프셋 — 화면에 보이는 순서 기준 '선두부터 연속된 frozen' 구간만.
   *  사용자가 컬럼을 드래그로 옮기면 연속이 깨져 자연히 해제된다(레이아웃 붕괴 방지). */
  const frozenLeft = new Map<string, number>();
  {
    let acc = 0;
    for (const h of leafHeaders) {
      if (!metaByKey.get(h.column.id)?.frozen) break;
      frozenLeft.set(h.column.id, acc);
      acc += h.getSize();
    }
  }
  const frozenStyle = (id: string): CSSProperties => {
    const left = frozenLeft.get(id);
    return left === undefined ? {} : { position: "sticky", left };
  };
  const isFrozen = (id: string) => frozenLeft.has(id);

  // 2단 그룹 헤더 — 연속된 동일 group 라벨을 colSpan 으로 묶고, 그룹 없는 컬럼은 빈 칸 1개씩
  const hasGroupRow = headers.some((h) => h.group);
  const groupRuns: { label: string | null; span: number; key: string }[] = [];
  if (hasGroupRow) {
    for (const h of leafHeaders) {
      const g = metaByKey.get(h.column.id)?.group ?? null;
      const last = groupRuns[groupRuns.length - 1];
      if (last && g !== null && last.label === g) last.span += 1;
      else groupRuns.push({ label: g, span: 1, key: h.column.id });
    }
  }

  // 컬럼 정렬 합계행 — 정렬용 원시값(v)을 합산하므로 컬럼 필터 결과에 자동 연동된다
  const hasTotalsRow = headers.some((h) => h.total || h.totalLabel);
  const totalsCells = hasTotalsRow
    ? leafHeaders.map((h) => {
        const m = metaByKey.get(h.column.id);
        if (m?.total === "sum") {
          const idx = headers.findIndex((x) => x.key === h.column.id);
          const sum = bodyRows.reduce((a, r) => a + (Number(r.original.cells[idx]?.v) || 0), 0);
          return sum.toLocaleString(undefined, { maximumFractionDigits: 3 });
        }
        return m?.totalLabel ?? "";
      })
    : [];

  // 리스트 영역 높이를 화면에 맞춤 — 세로로 길어도 합계(footer)·가로 스크롤바가 뷰포트 안에 들어오게.
  // ref의 style을 직접 조작(setState 아님) → 리렌더/린트 이슈 없음.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fit = () => {
      // 비정상 뷰포트(헤드리스/프리뷰 측정 컨텍스트에서 innerHeight=0 등)면 자연 높이 유지
      if (!window.innerHeight || window.innerHeight < 300) {
        el.style.maxHeight = "";
        return;
      }
      const top = el.getBoundingClientRect().top;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      const avail = window.innerHeight - top - footerH - 20; // 하단 여백
      el.style.maxHeight = `${Math.max(240, avail)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [data.length, footer]);

  // 컬럼 드래그 순서 변경 — 소스 id는 dataTransfer로 전달(state timing 무관하게 견고)
  const handleReorder = (fromId: string, targetId: string) => {
    if (!fromId || fromId === targetId) return setDragCol(null);
    setColumnOrder((prev) => {
      const order = prev.length ? [...prev] : headers.map((h) => h.key);
      const from = order.indexOf(fromId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      order.splice(to, 0, order.splice(from, 1)[0]);
      return order;
    });
    setDragCol(null);
  };

  return (
    <div className={cn("transition-opacity", navPending && "pointer-events-none opacity-60")}>
      {(hasRowNav || storageKey) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-faint">
            {hasRowNav ? "행 클릭=상세 · 헤더 드래그=순서변경 · 우측 끝 드래그=너비조절" : ""}
          </p>
          {storageKey && (
            <div className="relative shrink-0" ref={chooserRef}>
              <button
                type="button"
                onClick={() => setChooserOpen((v) => !v)}
                aria-expanded={chooserOpen}
                className="inline-flex items-center gap-1.5 rounded-field border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <ColumnsIcon />
                컬럼 <span className="tabular-nums text-faint">{visibleCount}/{headers.length}</span>
              </button>
              {chooserOpen && (
                <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-card border border-border bg-surface shadow-card">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-semibold text-foreground">표시할 컬럼</span>
                    <button type="button" onClick={resetView} className="text-[11px] text-primary hover:underline">
                      기본값
                    </button>
                  </div>
                  <div className="c4-scroll max-h-72 overflow-y-auto p-1.5">
                    {headers.map((h) => {
                      const on = columnVisibility[h.key] !== false;
                      return (
                        <label
                          key={h.key}
                          className="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-[13px] hover:bg-surface-2"
                        >
                          <input type="checkbox" checked={on} onChange={() => toggleCol(h.key)} className="accent-primary" />
                          {/* 피벗 그리드는 헤더가 '입고/출고/재고' 로 반복되므로 그룹(기간) 라벨을 앞에 붙여 구분한다 */}
                          <span className="truncate text-foreground">
                            {h.group ? `${h.group} ${h.header}` : h.header}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="border-t border-border px-3 py-1.5 text-[10px] text-faint">이 브라우저에 저장됩니다 (사용자별)</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* 가시영역 내 스크롤 컨테이너 — maxHeight를 뷰포트에 맞춰(효과) 가로 스크롤바·합계가 화면 안에 들어옴.
          너비: 컬럼합이 좁으면 width:100%로 비율대로 펼쳐 화면을 꽉 채우고, 넓으면 minWidth로 가로 스크롤. */}
      <div ref={scrollRef} className="c4-scroll overflow-auto rounded-card border border-border">
        <table className="border-collapse text-sm" style={{ width: "100%", minWidth: totalWidth, tableLayout: "fixed" }}>
          {/* table-layout:fixed 는 '첫 행'으로 폭을 잡는다 — 그룹헤더(colSpan)가 첫 행이 되면 폭이 무너지므로
              colgroup 으로 컬럼 폭을 명시해 첫 행과 무관하게 고정한다. */}
          <colgroup>
            {leafHeaders.map((h) => (
              <col key={h.id} style={{ width: h.getSize() }} />
            ))}
          </colgroup>
          <THead className="sticky top-0 z-10">
            {hasGroupRow && (
              <TR className="border-b border-border">
                {groupRuns.map((run) => (
                  <TH
                    key={run.key}
                    colSpan={run.span}
                    style={run.span === 1 ? frozenStyle(run.key) : undefined}
                    className={cn(
                      "bg-surface-2 text-center",
                      run.label ? "border-l border-border" : "",
                      run.span === 1 && isFrozen(run.key) && "z-20",
                    )}
                  >
                    {run.label ?? ""}
                  </TH>
                ))}
              </TR>
            )}
            <TR className="border-b border-border">
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const canSort = header.column.getCanSort();
                const dir = header.column.getIsSorted();
                return (
                  <TH
                    key={header.id}
                    style={{ width: header.getSize(), position: "relative", ...frozenStyle(header.column.id) }}
                    className={cn(
                      alignCls(meta?.align),
                      "bg-surface-2",
                      isFrozen(header.column.id) && "z-20",
                      dragCol === header.column.id && "opacity-40",
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleReorder(e.dataTransfer.getData("text/plain"), header.column.id);
                    }}
                  >
                    {/* 헤더 내용만 draggable(순서변경) — 리사이즈 핸들과 분리해 충돌 방지 */}
                    <div
                      className={cn("flex cursor-grab select-none items-center gap-1 active:cursor-grabbing", justifyCls(meta?.align))}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", header.column.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragCol(header.column.id);
                      }}
                      onDragEnd={() => setDragCol(null)}
                      title="클릭: 정렬 · 드래그: 순서변경"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
                        >
                          <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          <SortIndicator dir={dir} />
                        </button>
                      ) : (
                        <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      )}
                    </div>
                    {/* 리사이즈 핸들 (우측 끝) — 드래그/정렬과 충돌 방지 */}
                    <span
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      draggable={false}
                      className={cn(
                        "absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                        header.column.getIsResizing() ? "bg-primary" : "hover:bg-border-strong",
                      )}
                    />
                  </TH>
                );
              })}
            </TR>
            {showFilterRow && (
              <TR className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <TH
                    key={header.id}
                    style={{ width: header.getSize(), ...frozenStyle(header.column.id) }}
                    className={cn("bg-surface-2 py-1", isFrozen(header.column.id) && "z-20")}
                  >
                    {header.column.getCanFilter() ? (
                      <input
                        value={(header.column.getFilterValue() as string) ?? ""}
                        onChange={(e) => header.column.setFilterValue(e.target.value)}
                        placeholder="필터…"
                        className="w-full rounded-field border border-border bg-surface px-2 py-1 text-xs font-normal text-foreground placeholder:text-faint focus:border-primary focus:outline-none"
                      />
                    ) : null}
                  </TH>
                ))}
              </TR>
            )}
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={headers.length} className="px-3 py-8 text-center text-faint">
                  불러오는 중…
                </TD>
              </TR>
            ) : bodyRows.length === 0 ? (
              <TR>
                <TD colSpan={headers.length} className="px-3 py-8 text-center text-faint">
                  {emptyText}
                </TD>
              </TR>
            ) : (
              bodyRows.map((row) => {
                const href = row.original.href;
                const activate = onRowSelect
                  ? () => onRowSelect(row.original.key)
                  : href
                    ? () => rowNav(href)
                    : undefined;
                return (
                  <TR
                    key={row.id}
                    className={cn("group hover:bg-surface-2", activate && "cursor-pointer")}
                    {...(activate
                      ? {
                          role: onRowSelect ? "button" : "link",
                          tabIndex: 0,
                          onClick: activate,
                          onKeyDown: (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              activate();
                            }
                          },
                        }
                      : {})}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TD
                          key={cell.id}
                          style={{ width: cell.column.getSize(), ...frozenStyle(cell.column.id) }}
                          className={cn(
                            alignCls(meta?.align),
                            "overflow-hidden text-ellipsis",
                            isFrozen(cell.column.id) && "z-[1] bg-surface group-hover:bg-surface-2",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TD>
                      );
                    })}
                  </TR>
                );
              })
            )}
          </TBody>
          {hasTotalsRow && !loading && bodyRows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10">
              <TR className="border-t border-border-strong">
                {leafHeaders.map((h, i) => {
                  const m = metaByKey.get(h.column.id);
                  return (
                    <TD
                      key={h.id}
                      style={{ width: h.getSize(), ...frozenStyle(h.column.id) }}
                      className={cn(
                        alignCls(m?.align),
                        "bg-surface-2 font-semibold text-foreground",
                        isFrozen(h.column.id) && "z-20",
                      )}
                    >
                      {totalsCells[i]}
                    </TD>
                  );
                })}
              </TR>
            </tfoot>
          )}
        </table>
      </div>

      {footer && !loading && bodyRows.length > 0 && <div ref={footerRef}>{footer}</div>}

      {paginated && bodyRows.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length,
            )}{" "}
            / {table.getFilteredRowModel().rows.length.toLocaleString()}건
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              이전
            </Button>
            <span className="px-1">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              다음
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

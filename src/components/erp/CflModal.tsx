"use client";

/**
 * CflModal — Choose From List 검색 모달(공통).
 * 서버 액션 cflSearch(type, term)로 마스터 목록을 받아 DataTableClient(정렬 재사용)로 표시,
 * 행 클릭 시 onSelect(코드+이름) 콜백. 검색어 디바운스·Esc·백드롭 닫기.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cflSearch, type CflColumn } from "@/lib/cfl/actions";
import DataTableClient, { type HeaderMeta, type RowData } from "./DataTableClient";
import { Input } from "@/components/ui";

export type CflSelection = { value: string; label: string };

export default function CflModal({
  open,
  type,
  title,
  onSelect,
  onClose,
}: {
  open: boolean;
  type: string;
  title?: string;
  onSelect: (sel: CflSelection) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<CflColumn[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [valueKey, setValueKey] = useState("");
  const [labelKey, setLabelKey] = useState("");

  // 검색 (열림 + 타입 + 검색어 디바운스)
  useEffect(() => {
    if (!open) return;
    let active = true;
    const h = setTimeout(() => {
      setLoading(true);
      cflSearch(type, term)
        .then((res) => {
          if (!active) return;
          setColumns(res.columns);
          setRows(res.rows);
          setValueKey(res.valueKey);
          setLabelKey(res.labelKey);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [open, type, term]);

  // Esc 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const headers: HeaderMeta[] = columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    width: c.width,
    sortable: true,
    sortType: c.align === "right" ? "number" : "text",
    filterable: false,
  }));
  const gridData: RowData[] = rows.map((r) => ({
    key: String(r[valueKey]),
    cells: columns.map((c) => ({
      v: typeof r[c.key] === "number" ? (r[c.key] as number) : String(r[c.key] ?? ""),
      node: String(r[c.key] ?? ""),
    })),
  }));

  const handleSelect = (key: string | number) => {
    const row = rows.find((r) => String(r[valueKey]) === String(key));
    if (row) {
      onSelect({ value: String(row[valueKey]), label: String(row[labelKey] ?? row[valueKey]) });
      onClose(); // 모달이 스스로 닫음(부모 onSelect 구현과 무관하게 확실히 닫힘)
    }
  };

  // Portal로 body에 렌더 — Field의 <label> 밖으로 빼야 함(label 내부 클릭이 컨트롤로 전파되어 재오픈되는 문제 방지).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 p-4 pt-24"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-card border border-border bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "선택"}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title ?? "선택"}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="p-4">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="코드 또는 이름으로 검색…"
            className="mb-3"
          />
          <div className="c4-scroll max-h-[50vh] overflow-y-auto">
            <DataTableClient
              headers={headers}
              data={gridData}
              loading={loading}
              emptyText="검색 결과가 없습니다."
              onRowSelect={handleSelect}
            />
          </div>
          <p className="mt-2 text-right text-[11px] text-faint">행을 클릭하면 선택됩니다</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

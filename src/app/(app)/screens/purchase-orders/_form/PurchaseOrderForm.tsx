"use client";

/**
 * 구매오더 생성/수정 폼 — 레거시 DocBase.jsp(SAP B1 문서창) 재현. 판매오더 폼 미러.
 * DocumentFormShell(재사용 셸) 위에 헤더 3열 + 탭(내용/상세/기타) + 하단 합계 + 액션바(저장/신규/취소/목록).
 * - 내용: 라인 그리드(품목 CFL·수량·단가·세금그룹·공급가액·세액·총계·납품예정일·창고)
 * - 상세: 참조번호·지불조건 / 기타: 비고·저널적요
 * - mode="edit": 공급처·통화·전기일·사업장은 게시 후 제약이라 읽기전용
 * - 저장은 savePurchaseOrder, 취소는 cancelPurchaseOrder 서버 액션(SL 경유, 레거시 페이로드 계약)
 * - 매입 라인은 VatGroup 이 SL 필수 → 기본값 V2 유지. CostingCode(코스트센터)는 생략 가능.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Select, Field, fieldBase, Badge, buttonVariants } from "@/components/ui";
import { Card, CardHeader, CardBody, TableBare, THead, TBody, TR, TH, TD } from "@/components/ui";
import { CflPicker, DocumentFormShell } from "@/components/erp";
import { savePurchaseOrder, cancelPurchaseOrder } from "./actions";
import type {
  Opt,
  VatOpt,
  PurchaseOrderInitial,
  PurchaseOrderLineValue,
  SavePurchaseOrderResult,
} from "./types";
import { useLineColVisible, useHeaderFieldVisible, UdfInput, type UdfDefC } from "../../_shared/docFormLayout";

let uid = 1;
const emptyLine = (whs: string, cc: string, vat: string, ship: string): PurchaseOrderLineValue => ({
  key: `n${uid++}`,
  itemCode: "",
  itemName: "",
  quantity: "0",
  price: "0",
  vatGroup: vat,
  shipDate: ship,
  whsCode: whs,
  costingCode: cc,
  udf: {},
});

function won(v: number): string {
  return "₩" + Math.round(v).toLocaleString("ko-KR");
}

export default function PurchaseOrderForm({
  mode,
  docEntry,
  refs,
  initial,
  storageNs,
  uid: userId,
}: {
  mode: "create" | "edit";
  docEntry?: number;
  refs: {
    branches: Opt[];
    warehouses: Opt[];
    costCenters: Opt[];
    currencies: Opt[];
    vatGroups: VatOpt[];
    paymentTerms: Opt[];
    headerUdfs: UdfDefC[];
    lineUdfs: UdfDefC[];
  };
  initial: PurchaseOrderInitial;
  /** 상세 컬럼선택 저장키 네임스페이스(예 "purchase-orders") — 생성폼이 그 선택대로 입력칸 노출 */
  storageNs: string;
  /** 사용자 키(상세와 동일 저장키 공유) */
  uid: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pendingCancel, startCancel] = useTransition();
  const [result, setResult] = useState<SavePurchaseOrderResult | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const isEdit = mode === "edit";

  const defWhs = refs.warehouses.find((w) => w.value === "W1000")?.value ?? refs.warehouses[0]?.value ?? "";
  // 구매는 코스트센터 미필수 — 기본 빈값(컬럼은 유지)
  const defCc = "";
  // 매입 세금그룹 기본 V2((매입)과세-세금계산서 10%). 라인마다 반드시 채워 보내야 SL 통과
  const defVat = refs.vatGroups.find((v) => v.value === "V2")?.value ?? refs.vatGroups[0]?.value ?? "";

  const [cardCode, setCardCode] = useState(initial.cardCode);
  const [cardName, setCardName] = useState(initial.cardName);
  const [currency, setCurrency] = useState(initial.currency || "KRW");
  const [docDate, setDocDate] = useState(initial.docDate);
  const [docDueDate, setDocDueDate] = useState(initial.docDueDate);
  const [bplId, setBplId] = useState(initial.bplId || refs.branches[0]?.value || "");
  const [numAtCard, setNumAtCard] = useState(initial.numAtCard);
  const [paymentGroup, setPaymentGroup] = useState(initial.paymentGroup);
  const [journalMemo, setJournalMemo] = useState(initial.journalMemo);
  const [comments, setComments] = useState(initial.comments);
  const [lines, setLines] = useState<PurchaseOrderLineValue[]>(
    initial.lines.length ? initial.lines : [emptyLine(defWhs, defCc, defVat, initial.docDueDate)],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [headerUdf, setHeaderUdf] = useState<Record<string, string>>(initial.headerUdf ?? {});

  // 상세 컬럼선택(localStorage) → 생성폼 입력칸 표시여부 (같은 저장키·사용자). 미선택 컬럼은 default.
  const lineVisible = useLineColVisible(storageNs, userId);
  const hdrVisible = useHeaderFieldVisible(storageNs, userId);
  const setHeaderUdfVal = (col: string, v: string) => setHeaderUdf((m) => ({ ...m, [col]: v }));
  const setLineUdf = (key: string, col: string, v: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, udf: { ...l.udf, [col]: v } } : l)));

  const setLine = (key: string, patch: Partial<PurchaseOrderLineValue>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine(defWhs, defCc, defVat, docDueDate)]);
  const toggleSel = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const removeSelected = () => {
    setLines((ls) => {
      const kept = ls.filter((l) => !selected.has(l.key));
      return kept.length ? kept : ls; // 최소 1행 유지
    });
    setSelected(new Set());
  };

  const resetForm = () => {
    setResult(null);
    setCardCode("");
    setCardName("");
    setCurrency("KRW");
    setNumAtCard("");
    setPaymentGroup("");
    setJournalMemo("");
    setComments("");
    setHeaderUdf({});
    setLines([emptyLine(defWhs, defCc, defVat, docDueDate)]);
    setSelected(new Set());
  };

  // 세율(%) · 라인/합계 계산 (레거시 LineCal: 공급가액=수량×단가, 세액=round(공급가액×세율/100))
  const rateOf = (vatGroup: string) => refs.vatGroups.find((v) => v.value === vatGroup)?.rate ?? 0;
  const supplyOf = (l: PurchaseOrderLineValue) => {
    const q = parseFloat(l.quantity);
    const p = parseFloat(l.price);
    return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
  };
  const vatOf = (l: PurchaseOrderLineValue) => Math.round((supplyOf(l) * rateOf(l.vatGroup)) / 100);
  const whsNameOf = (code: string) => {
    const w = refs.warehouses.find((x) => x.value === code);
    return w ? w.label.slice(w.value.length).trim() : "";
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => {
        const s = supplyOf(l);
        const v = vatOf(l);
        acc.qty += Number.isFinite(parseFloat(l.quantity)) ? parseFloat(l.quantity) : 0;
        acc.supply += s;
        acc.vat += v;
        acc.total += s + v;
        return acc;
      },
      { qty: 0, supply: 0, vat: 0, total: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, refs.vatGroups]);

  const submit = () => {
    setResult(null);
    start(async () => {
      const r = await savePurchaseOrder({
        docEntry: isEdit ? docEntry : undefined,
        cardCode,
        cardName,
        currency,
        docDate: isEdit ? undefined : docDate || undefined,
        docDueDate,
        bplId: Number(bplId),
        slpCode: initial.slpCode ? Number(initial.slpCode) : undefined,
        numAtCard: numAtCard || undefined,
        paymentGroup: paymentGroup ? Number(paymentGroup) : undefined,
        journalMemo: journalMemo || undefined,
        comments,
        udf: headerUdf,
        lines: lines.map((l) => ({
          itemCode: l.itemCode.trim(),
          quantity: Number(l.quantity),
          price: l.price.trim() ? Number(l.price) : undefined,
          vatGroup: l.vatGroup || undefined,
          shipDate: l.shipDate || undefined,
          whsCode: l.whsCode || undefined,
          costingCode: l.costingCode || undefined,
          lineNum: l.lineNum,
          udf: l.udf,
        })),
      });
      setResult(r);
      if (r.ok) {
        router.push(`/screens/purchase-orders/${r.docEntry}`);
        router.refresh();
      }
    });
  };

  const doCancel = () =>
    startCancel(async () => {
      if (docEntry == null) return;
      const r = await cancelPurchaseOrder(docEntry);
      if (r.ok) {
        router.push(`/screens/purchase-orders/${docEntry}`);
        router.refresh();
      } else {
        setResult({ ok: false, error: r.error });
        setCancelConfirm(false);
      }
    });

  const roText = "flex h-9 items-center rounded-field bg-surface-2 px-3 text-[13px]";

  // ── 헤더 3열 ────────────────────────────────────────────────
  const header = (
    <Card>
      <CardBody>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-3">
          {/* 공급처열 */}
          <div className="space-y-3">
            <Field label="공급처" required>
              {isEdit ? (
                <div className={`${roText} text-foreground`}>
                  <span className="text-muted">{cardCode}</span>
                  <span className="ml-1.5 truncate">{cardName}</span>
                </div>
              ) : (
                <CflPicker
                  type="Vendor"
                  value={cardCode}
                  label={cardName || cardCode}
                  onChange={(s) => {
                    setCardCode(s.value);
                    setCardName(s.label);
                  }}
                  placeholder="공급처 선택…"
                />
              )}
            </Field>
            <Field label="구매담당">
              <div className={`${roText} text-faint`}>{initial.slpCode || "미지정"}</div>
            </Field>
          </div>

          {/* 문서·상태열 */}
          <div className="space-y-3">
            <Field label="문서번호">
              <div className={`${roText} text-muted`}>{isEdit ? initial.docNum || docEntry : "신규 (저장 시 자동)"}</div>
            </Field>
            <Field label="사업장" required>
              {isEdit ? (
                <div className={`${roText} text-muted`}>
                  {refs.branches.find((b) => b.value === bplId)?.label ?? bplId}
                </div>
              ) : (
                <Select value={bplId} onChange={(e) => setBplId(e.target.value)}>
                  {refs.branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {/* 일자·통화열 */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="전기일" required>
                {isEdit ? (
                  <div className={`${roText} text-muted`}>{docDate || "-"}</div>
                ) : (
                  <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                )}
              </Field>
              <Field label="납기일" required>
                <Input type="date" value={docDueDate} onChange={(e) => setDocDueDate(e.target.value)} />
              </Field>
            </div>
            <Field label="통화">
              {isEdit ? (
                <div className={`${roText} text-muted`}>{currency}</div>
              ) : (
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {refs.currencies.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  // ── 내용 탭 (라인 그리드) ────────────────────────────────────
  const contentTab = (
    <Card>
      <CardHeader
        title="품목 라인"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title="문서연결(구매오더→구매입고)은 후속에서 지원"
              className={buttonVariants({ variant: "outline", size: "sm" }) + " cursor-not-allowed opacity-50"}
            >
              가져오기
            </button>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + 행추가
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={removeSelected}
              disabled={selected.size === 0}
              className="text-danger hover:text-danger"
            >
              − 행삭제
            </Button>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <TableBare>
          <THead>
            <TR className="border-b border-border">
              <TH className="w-10 text-center">선택</TH>
              <TH className="w-10 text-right">#</TH>
              <TH>품목코드 *</TH>
              {lineVisible("Dscription", true) && <TH>품목명</TH>}
              <TH className="text-right">수량 *</TH>
              {lineVisible("Price", true) && <TH className="text-right">단가</TH>}
              {lineVisible("VatGroup", true) && <TH>세금그룹</TH>}
              {lineVisible("LineTotal", true) && <TH className="text-right">공급가액</TH>}
              {lineVisible("VatSum", true) && <TH className="text-right">세액</TH>}
              {lineVisible("GTotal", true) && <TH className="text-right">총계</TH>}
              {lineVisible("ShipDate", true) && <TH>납품예정일</TH>}
              {lineVisible("WhsCode", true) && <TH>창고</TH>}
              {lineVisible("WhsCode", true) && <TH>창고명</TH>}
              {lineVisible("OcrCode", false) && <TH>코스트센터</TH>}
              {refs.lineUdfs
                .filter((u) => lineVisible(u.column, false))
                .map((u) => (
                  <TH key={u.column}>{u.label}</TH>
                ))}
            </TR>
          </THead>
          <TBody>
            {lines.map((l, i) => {
              const s = supplyOf(l);
              const v = vatOf(l);
              return (
                <TR key={l.key}>
                  <TD className="text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(l.key)}
                      onChange={() => toggleSel(l.key)}
                      className="align-middle accent-[var(--color-primary)]"
                    />
                  </TD>
                  <TD className="text-right tabular-nums text-faint">{i + 1}</TD>
                  <TD>
                    <CflPicker
                      type="Item"
                      value={l.itemCode}
                      label={l.itemName || l.itemCode}
                      onChange={(sel) => setLine(l.key, { itemCode: sel.value, itemName: sel.label })}
                      placeholder="품목 선택…"
                      showSearchButton={false}
                      className="w-48"
                    />
                  </TD>
                  {lineVisible("Dscription", true) && (
                    <TD className="max-w-[180px] truncate text-muted">{l.itemName || "—"}</TD>
                  )}
                  <TD>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      className="w-20 text-right"
                    />
                  </TD>
                  {lineVisible("Price", true) && (
                    <TD>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={l.price}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                        className="w-28 text-right"
                      />
                    </TD>
                  )}
                  {lineVisible("VatGroup", true) && (
                    <TD>
                      <Select
                        value={l.vatGroup}
                        onChange={(e) => setLine(l.key, { vatGroup: e.target.value })}
                        className="w-40"
                      >
                        {refs.vatGroups.map((vg) => (
                          <option key={vg.value} value={vg.value}>
                            {vg.label}
                          </option>
                        ))}
                      </Select>
                    </TD>
                  )}
                  {lineVisible("LineTotal", true) && <TD className="text-right tabular-nums text-muted">{won(s)}</TD>}
                  {lineVisible("VatSum", true) && <TD className="text-right tabular-nums text-muted">{won(v)}</TD>}
                  {lineVisible("GTotal", true) && <TD className="text-right tabular-nums font-medium">{won(s + v)}</TD>}
                  {lineVisible("ShipDate", true) && (
                    <TD>
                      <Input
                        type="date"
                        value={l.shipDate}
                        onChange={(e) => setLine(l.key, { shipDate: e.target.value })}
                        className="w-36"
                      />
                    </TD>
                  )}
                  {lineVisible("WhsCode", true) && (
                    <TD>
                      <Select
                        value={l.whsCode}
                        onChange={(e) => setLine(l.key, { whsCode: e.target.value })}
                        className="w-28"
                      >
                        {refs.warehouses.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.value}
                          </option>
                        ))}
                      </Select>
                    </TD>
                  )}
                  {lineVisible("WhsCode", true) && (
                    <TD className="max-w-[140px] truncate text-muted">{whsNameOf(l.whsCode) || "—"}</TD>
                  )}
                  {lineVisible("OcrCode", false) && (
                    <TD>
                      <Select
                        value={l.costingCode}
                        onChange={(e) => setLine(l.key, { costingCode: e.target.value })}
                        className="w-32"
                      >
                        <option value="">-</option>
                        {refs.costCenters.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.value}
                          </option>
                        ))}
                      </Select>
                    </TD>
                  )}
                  {refs.lineUdfs
                    .filter((u) => lineVisible(u.column, false))
                    .map((u) => (
                      <TD key={u.column}>
                        <UdfInput
                          def={u}
                          value={l.udf[u.column] ?? ""}
                          onChange={(val) => setLineUdf(l.key, u.column, val)}
                          className="w-36"
                        />
                      </TD>
                    ))}
                </TR>
              );
            })}
          </TBody>
        </TableBare>
      </div>
    </Card>
  );

  // ── 상세 탭 ─────────────────────────────────────────────────
  const detailTab = (
    <Card>
      <CardBody>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="공급처 참조번호">
            <Input value={numAtCard} onChange={(e) => setNumAtCard(e.target.value)} placeholder="예: 발주번호" />
          </Field>
          <Field label="지불조건">
            <Select value={paymentGroup} onChange={(e) => setPaymentGroup(e.target.value)}>
              <option value="">거래처 기본값</option>
              {refs.paymentTerms.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {/* 헤더 UDF — 상세에서 '표시'로 켠 사용자필드만 입력 노출 */}
        {refs.headerUdfs.some((u) => hdrVisible(u.column, false)) && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold text-muted">사용자 필드</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {refs.headerUdfs
                .filter((u) => hdrVisible(u.column, false))
                .map((u) => (
                  <Field key={u.column} label={u.label}>
                    <UdfInput def={u} value={headerUdf[u.column] ?? ""} onChange={(val) => setHeaderUdfVal(u.column, val)} />
                  </Field>
                ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">
          ※ 라인 컬럼·헤더 사용자필드는 <b>상세화면에서 &lsquo;표시&rsquo;로 켠 항목</b>만 입력칸으로 나옵니다.
        </p>
      </CardBody>
    </Card>
  );

  // ── 기타 탭 ─────────────────────────────────────────────────
  const etcTab = (
    <Card>
      <CardBody>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
          <Field label="비고">
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="비고"
              className={`${fieldBase} h-auto resize-none py-2`}
            />
          </Field>
          <Field label="저널 적요">
            <Input value={journalMemo} onChange={(e) => setJournalMemo(e.target.value)} placeholder="전표 적요" />
          </Field>
        </div>
      </CardBody>
    </Card>
  );

  // ── 하단 합계 ───────────────────────────────────────────────
  const footer = (
    <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 rounded-card bg-surface-2 px-5 py-3 text-sm">
      <span>
        <span className="text-muted">수량</span>{" "}
        <span className="font-semibold tabular-nums">{totals.qty.toLocaleString("ko-KR")}</span>
      </span>
      <span>
        <span className="text-muted">공급가액</span>{" "}
        <span className="font-semibold tabular-nums">{won(totals.supply)}</span>
      </span>
      <span>
        <span className="text-muted">부가세</span>{" "}
        <span className="font-semibold tabular-nums">{won(totals.vat)}</span>
      </span>
      <span>
        <span className="text-muted">합계</span>{" "}
        <span className="font-bold tabular-nums">{won(totals.total)}</span>
      </span>
    </div>
  );

  // ── 액션바 ──────────────────────────────────────────────────
  const actions = (
    <>
      <Button type="button" onClick={submit} disabled={pending || pendingCancel}>
        {pending ? "저장 중…" : "저장"}
      </Button>
      {isEdit ? (
        <Link href="/screens/purchase-orders/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
          신규
        </Link>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={resetForm} disabled={pending}>
          신규
        </Button>
      )}
      {isEdit &&
        (cancelConfirm ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted">문서 취소?</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={doCancel}
              disabled={pendingCancel}
              className="text-danger hover:text-danger"
            >
              {pendingCancel ? "처리 중…" : "확인"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCancelConfirm(false)} disabled={pendingCancel}>
              아니오
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCancelConfirm(true)}
            className="text-danger hover:text-danger"
          >
            취소
          </Button>
        ))}
      <Link
        href={isEdit && docEntry ? `/screens/purchase-orders/${docEntry}` : "/screens/purchase-orders"}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        목록
      </Link>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <DocumentFormShell
        title={isEdit ? `구매오더 #${initial.docNum || docEntry}` : "구매오더 신규"}
        status={
          isEdit ? <Badge variant="info">미결</Badge> : <Badge variant="neutral">신규</Badge>
        }
        actions={actions}
        header={header}
        tabs={[
          { value: "content", label: `내용 · ${lines.length}행`, content: contentTab },
          { value: "detail", label: "상세", content: detailTab },
          { value: "etc", label: "기타", content: etcTab },
        ]}
        footer={footer}
      />

      {result && !result.ok && (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg">
          {isEdit ? "처리" : "등록"} 실패: {result.error}
        </div>
      )}
      {!isEdit && (
        <p className="text-xs text-faint">
          ※ 테스트 스키마 전기기간은 2026-05만 열려 있음. SL 경유 실제 생성됩니다. 단가·금액은 SAP 가격표 기준으로 확정됩니다(화면 금액은 예상치).
        </p>
      )}
    </div>
  );
}

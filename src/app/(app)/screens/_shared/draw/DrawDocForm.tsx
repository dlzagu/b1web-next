"use client";

/**
 * DrawDocForm — 문서연결(draw) 생성 폼 범용 컴포넌트 (DocBase 셸).
 * 가져오기: 열린 상위문서를 모달로 골라 미납/미청구 라인을 BaseEntry/BaseLine 으로 끌어온다.
 * 저장 = 주입된 서버액션(save → SL createFromBase). 거래처·통화는 첫 draw 시 고정.
 * 문서종류(납품/송장/구매입고/매입송장)는 labels + actions 주입으로만 구분(코드 공유).
 * (rules.md [★DRY-공통함수화])
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Field, fieldBase, Badge, buttonVariants } from "@/components/ui";
import { Card, CardHeader, CardBody, TableBare, THead, TBody, TR, TH, TD } from "@/components/ui";
import { DocumentFormShell } from "@/components/erp";
import { useHeaderFieldVisible, useLineColVisible, UdfInput, type UdfDefC } from "../docFormLayout";
import type { DrawInitial, DrawLineValue, DrawActions, DrawLabels, OpenBaseDoc, SaveResult } from "./types";

let uid = 1;
function won(v: number): string {
  return "₩" + Math.round(v).toLocaleString("ko-KR");
}
function num(v: number): string {
  return Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

export default function DrawDocForm({
  initial,
  labels,
  actions,
  storageNs,
  uid: userId,
  headerUdfs,
  lineUdfs,
}: {
  initial: DrawInitial;
  labels: DrawLabels;
  actions: DrawActions;
  /** 상세 선택 저장키 네임스페이스(각 화면 폴더명과 동일) — 상세에서 켠 헤더/라인 UDF만 입력 노출 */
  storageNs: string;
  /** 사용자 키(상세와 동일 저장키 공유). ※ 모듈 uid(라인키)와 충돌 회피 위해 userId 로 alias */
  uid: string;
  /** 대상 헤더테이블 UDF 정의(ODLN/OINV/OPDN/OPCH) */
  headerUdfs: UdfDefC[];
  /** 대상 라인테이블 UDF 정의(DLN1/INV1/PDN1/PCH1) — 상세 라인선택대로 입력 노출 */
  lineUdfs: UdfDefC[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fetching, startFetch] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);

  const [cardCode, setCardCode] = useState(initial.cardCode);
  const [cardName, setCardName] = useState(initial.cardName);
  const [currency, setCurrency] = useState(initial.currency || "KRW");
  const [docDate, setDocDate] = useState(initial.docDate);
  const [docDueDate, setDocDueDate] = useState(initial.docDueDate);
  const [numAtCard, setNumAtCard] = useState(initial.numAtCard);
  const [comments, setComments] = useState(initial.comments);
  const [lines, setLines] = useState<DrawLineValue[]>(initial.lines);
  const [headerUdf, setHeaderUdf] = useState<Record<string, string>>(initial.headerUdf ?? {});

  // 상세 헤더 필드선택(localStorage) → 생성폼 헤더 UDF 입력칸 표시여부 (같은 저장키·사용자). 미선택은 default(숨김).
  const hdrVisible = useHeaderFieldVisible(storageNs, userId);
  const lineVisible = useLineColVisible(storageNs, userId);
  const setHeaderUdfVal = (col: string, v: string) => setHeaderUdf((m) => ({ ...m, [col]: v }));
  const setLineUdf = (key: string, col: string, v: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, udf: { ...(l.udf ?? {}), [col]: v } } : l)));
  const visibleLineUdfs = lineUdfs.filter((u) => lineVisible(u.column, false));

  // 가져오기 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [bases, setBases] = useState<OpenBaseDoc[]>([]);

  const setLineQty = (key: string, v: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: v } : l)));
  const removeLine = (key: string) =>
    setLines((ls) => {
      const kept = ls.filter((l) => l.key !== key);
      if (kept.length === 0) resetCustomer(); // 라인 전부 삭제 시 거래처 잠금 해제
      return kept;
    });

  /** 거래처 잠금 해제 (다른 거래처 상위문서를 실수로 골랐을 때) */
  const resetCustomer = () => {
    setCardCode("");
    setCardName("");
    setCurrency("KRW");
  };
  /** 초기화 — 라인·거래처 전부 비움 */
  const resetAll = () => {
    setLines([]);
    resetCustomer();
    setResult(null);
  };

  const openImport = () => {
    setModalOpen(true);
    setBases([]);
    startFetch(async () => {
      setBases(await actions.fetchOpenBase(cardCode || undefined));
    });
  };

  const pickBase = (o: OpenBaseDoc) =>
    startFetch(async () => {
      const r = await actions.fetchBaseLines(o.docEntry);
      if (!r) {
        setResult({ ok: false, error: "상위문서 미납/미청구 라인을 불러오지 못했습니다(마감/취소 가능)." });
        setModalOpen(false);
        return;
      }
      // 첫 draw면 거래처·통화 고정
      setCardCode((prev) => prev || r.cardCode);
      setCardName((prev) => prev || r.cardName);
      setCurrency((prev) => prev || r.docCur || "KRW");
      setLines((prev) => {
        const seen = new Set(prev.map((l) => `${l.baseEntry}-${l.baseLine}`));
        const add: DrawLineValue[] = r.lines
          .filter((ln) => !seen.has(`${ln.baseEntry}-${ln.baseLine}`))
          .map((ln) => ({
            key: `d${uid++}`,
            baseEntry: ln.baseEntry,
            baseLine: ln.baseLine,
            itemCode: ln.itemCode,
            itemName: ln.itemName ?? ln.itemCode,
            baseQty: Number(ln.baseQty),
            openQty: Number(ln.openQty),
            quantity: String(ln.openQty),
            price: Number(ln.price),
            whsCode: ln.whsCode,
            whsName: ln.whsName ?? "",
          }));
        return [...prev, ...add];
      });
      setModalOpen(false);
    });

  const totalQty = useMemo(
    () => lines.reduce((a, l) => a + (Number.isFinite(parseFloat(l.quantity)) ? parseFloat(l.quantity) : 0), 0),
    [lines],
  );
  const totalAmt = useMemo(
    () => lines.reduce((a, l) => a + (Number.isFinite(parseFloat(l.quantity)) ? parseFloat(l.quantity) * l.price : 0), 0),
    [lines],
  );

  const submit = () => {
    setResult(null);
    start(async () => {
      const r = await actions.save({
        cardCode,
        docDate: docDate || undefined,
        docDueDate: docDueDate || undefined,
        numAtCard: numAtCard || undefined,
        comments,
        udf: headerUdf,
        lines: lines.map((l) => ({
          baseEntry: l.baseEntry,
          baseLine: l.baseLine,
          quantity: Number(l.quantity),
          udf: l.udf,
        })),
      });
      setResult(r);
      if (r.ok) {
        // 상세로 이동(대상은 force-dynamic → push 만으로 최신).
        // ⚠️ push 직후 router.refresh() 금지: 같은 트랜지션에서 isPending(저장 스피너)이 안 풀리고
        //    떠나는 페이지를 재요청해 "계속 렌더링"처럼 보임(2026-07-13 확인).
        router.push(`${labels.listHref}/${r.docEntry}`);
      }
    });
  };

  const roText = "flex h-9 items-center rounded-field bg-surface-2 px-3 text-[13px]";

  const header = (
    <Card>
      <CardBody>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-3">
          <div className="space-y-3">
            <Field label="거래처">
              <div className={`${roText} ${cardCode ? "text-foreground" : "text-faint"}`}>
                {cardCode ? (
                  <>
                    <span className="text-muted">{cardCode}</span>
                    <span className="ml-1.5 truncate">{cardName}</span>
                  </>
                ) : (
                  "가져오기로 상위문서 선택"
                )}
              </div>
            </Field>
            <Field label="고객 참조번호">
              <Input value={numAtCard} onChange={(e) => setNumAtCard(e.target.value)} placeholder="예: 발주번호" />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label="문서번호">
              <div className={`${roText} text-muted`}>신규 (저장 시 자동)</div>
            </Field>
            <Field label="통화">
              <div className={`${roText} text-muted`}>{currency}</div>
            </Field>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="전기일" required>
                <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </Field>
              <Field label="납기일">
                <Input type="date" value={docDueDate} onChange={(e) => setDocDueDate(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
        {/* 헤더 UDF — 상세에서 '표시'로 켠 헤더 사용자필드만 입력 노출 */}
        {headerUdfs.some((u) => hdrVisible(u.column, false)) && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold text-muted">사용자 필드</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {headerUdfs
                .filter((u) => hdrVisible(u.column, false))
                .map((u) => (
                  <Field key={u.column} label={u.label}>
                    <UdfInput def={u} value={headerUdf[u.column] ?? ""} onChange={(val) => setHeaderUdfVal(u.column, val)} />
                  </Field>
                ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );

  const contentTab = (
    <Card>
      <CardHeader
        title={labels.lineCardTitle}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openImport} disabled={fetching}>
              {fetching ? "불러오는 중…" : labels.importLabel}
            </Button>
            {lines.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetAll}
                className="text-danger hover:text-danger"
              >
                초기화
              </Button>
            )}
          </div>
        }
      />
      {lines.length === 0 ? (
        <CardBody>
          <div className="rounded-card border border-dashed border-border bg-surface-2 p-6 text-center text-sm text-muted">
            <span className="font-medium text-foreground">가져오기</span>로 {labels.emptyLines}
          </div>
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <TableBare>
            <THead>
              <TR className="border-b border-border">
                <TH className="w-10 text-right">#</TH>
                <TH>품목코드</TH>
                <TH>품목명</TH>
                <TH className="text-right">{labels.baseQtyCol}</TH>
                <TH className="text-right">{labels.openQtyCol}</TH>
                <TH className="text-right">{labels.qtyCol} *</TH>
                <TH className="text-right">금액</TH>
                <TH>창고</TH>
                <TH className="w-16 text-center">{labels.baseRefCol}</TH>
                {visibleLineUdfs.map((u) => (
                  <TH key={u.column}>{u.label}</TH>
                ))}
                <TH className="w-12"></TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l, i) => {
                const q = parseFloat(l.quantity);
                const over = Number.isFinite(q) && q > l.openQty;
                return (
                  <TR key={l.key}>
                    <TD className="text-right tabular-nums text-faint">{i + 1}</TD>
                    <TD>{l.itemCode}</TD>
                    <TD className="max-w-[200px] truncate text-muted">{l.itemName}</TD>
                    <TD className="text-right tabular-nums text-muted">{num(l.baseQty)}</TD>
                    <TD className="text-right tabular-nums">{num(l.openQty)}</TD>
                    <TD>
                      <Input
                        type="number"
                        min="0"
                        max={l.openQty}
                        step="1"
                        value={l.quantity}
                        onChange={(e) => setLineQty(l.key, e.target.value)}
                        className={`w-24 text-right ${over ? "border-danger text-danger-fg" : ""}`}
                      />
                    </TD>
                    <TD className="text-right tabular-nums text-muted">
                      {won((Number.isFinite(q) ? q : 0) * l.price)}
                    </TD>
                    <TD>
                      <span className="text-muted">{l.whsCode}</span> {l.whsName}
                    </TD>
                    <TD className="text-center text-xs text-faint">#{l.baseEntry}</TD>
                    {visibleLineUdfs.map((u) => (
                      <TD key={u.column}>
                        <UdfInput
                          def={u}
                          value={l.udf?.[u.column] ?? ""}
                          onChange={(val) => setLineUdf(l.key, u.column, val)}
                          className="w-36"
                        />
                      </TD>
                    ))}
                    <TD>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(l.key)}
                        className="text-danger hover:text-danger"
                      >
                        삭제
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableBare>
        </div>
      )}
    </Card>
  );

  const etcTab = (
    <Card>
      <CardBody>
        <Field label="비고">
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="비고"
            className={`${fieldBase} h-auto resize-none py-2`}
          />
        </Field>
      </CardBody>
    </Card>
  );

  const footer = (
    <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 rounded-card bg-surface-2 px-5 py-3 text-sm">
      <span>
        <span className="text-muted">{labels.qtyTotalLabel}</span>{" "}
        <span className="font-semibold tabular-nums">{num(totalQty)}</span>
      </span>
      <span>
        <span className="text-muted">금액(예상)</span> <span className="font-bold tabular-nums">{won(totalAmt)}</span>
      </span>
    </div>
  );

  const actionBar = (
    <>
      <Button type="button" onClick={submit} disabled={pending || lines.length === 0}>
        {pending ? "저장 중…" : labels.saveLabel}
      </Button>
      <Link href={labels.listHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        목록
      </Link>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <DocumentFormShell
        title={labels.newTitle}
        status={<Badge variant="neutral">신규</Badge>}
        actions={actionBar}
        header={header}
        tabs={[
          { value: "content", label: `내용 · ${lines.length}행`, content: contentTab },
          { value: "etc", label: "기타", content: etcTab },
        ]}
        footer={footer}
      />

      {result && !result.ok && (
        <div className="rounded-card border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg">
          {labels.failLabel} 실패: {result.error}
        </div>
      )}
      <p className="text-xs text-faint">{labels.note}</p>

      {/* 가져오기 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <div className="mt-10 w-full max-w-2xl rounded-card border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                {labels.modalTitle} {cardCode && <span className="text-muted">· {cardName}</span>}
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                닫기
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {fetching ? (
                <div className="p-6 text-center text-sm text-muted">불러오는 중…</div>
              ) : bases.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted">{labels.emptyImport}</div>
              ) : (
                <TableBare>
                  <THead>
                    <TR className="border-b border-border">
                      <TH className="text-right">{labels.baseNumCol}</TH>
                      <TH>거래처</TH>
                      <TH>전기일</TH>
                      <TH className="text-right">{labels.openTotalCol}</TH>
                      <TH className="w-16"></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {bases.map((o) => (
                      <TR key={o.docEntry}>
                        <TD className="text-right tabular-nums text-info">{o.docNum}</TD>
                        <TD>
                          <span className="text-muted">{o.cardCode}</span> {o.cardName}
                        </TD>
                        <TD>{o.docDate}</TD>
                        <TD className="text-right tabular-nums">{won(o.openTotal)}</TD>
                        <TD>
                          <Button type="button" variant="outline" size="sm" onClick={() => pickBase(o)} disabled={fetching}>
                            선택
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableBare>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

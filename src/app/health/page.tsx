/**
 * /health — 조회·쓰기 경로 헬스체크
 * 서버 컴포넌트. 런타임에 두 계층을 병렬 점검해 표시.
 * force-dynamic: 빌드 시 프리렌더(=빌드타임 DB 접속) 방지.
 */
import { slHealthCheck } from "@/lib/sl/client";
import { hanaHealthCheck } from "@/lib/db/hana";
import { isSharedDb } from "@/lib/db/sqlite";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

function StatusRow({ c }: { c: Check }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          c.ok ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"
        }`}
        aria-hidden
      >
        {c.ok ? "✓" : "✕"}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{c.name}</p>
        <p className="mt-0.5 break-words text-sm text-muted">{c.detail}</p>
      </div>
    </Card>
  );
}

export default async function HealthPage() {
  const [sl, hana] = await Promise.all([slHealthCheck(), hanaHealthCheck()]);
  const checks: Check[] = [
    { name: "ERP 엔진 (쓰기 경로)", ok: sl.ok, detail: sl.detail },
    { name: "조회 게이트웨이 (read-only)", ok: hana.ok, detail: hana.detail },
  ];
  const allOk = checks.every((c) => c.ok);
  const now = new Date().toISOString();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          시스템 헬스체크
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={allOk ? "success" : "danger"}>
            {allOk ? "정상 (all systems operational)" : "일부 장애 (degraded)"}
          </Badge>
          <span className="text-xs text-faint">{now}</span>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {checks.map((c) => (
          <StatusRow key={c.name} c={c} />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">
        연결 대상: {isSharedDb() ? "공유 데모 DB (libSQL/Turso — 인스턴스 간 공유, 매일 초기화)" : "내장 데모 DB (SQLite 파일/메모리)"} ·
        데이터는 전부 가상입니다
      </p>
    </main>
  );
}

/**
 * README 스크린샷 생성기 — 설치된 Chrome/Edge 를 puppeteer-core 로 구동한다(브라우저 다운로드 없음).
 *
 *   npm run dev            # 다른 터미널에서 (기본 http://localhost:3100)
 *   npm run shots          # docs/images/*.png 재생성
 *
 * 화면이 바뀌면 이 스크립트를 다시 돌려 이미지를 갱신한다 — README 가 실물과 어긋나지 않게 하는 게 목적.
 * 로그인은 실제 '데모 계정으로 둘러보기' 버튼을 눌러 통과하므로, 이 스크립트가 곧 그 버튼의 스모크이기도 하다.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "docs", "images");

/** 설치된 브라우저 자동 탐색 (Windows/macOS/Linux 공통 후보) */
function findBrowser(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error("Chrome/Edge 를 찾지 못했습니다. CHROME_PATH 로 지정하세요.");
  return found;
}

/** dev 서버의 Next.js 개발 인디케이터(좌하단 N 배지)는 결과물에 찍히면 안 된다 */
const HIDE_DEV_UI = "nextjs-portal{display:none!important}";

type Shot = { file: string; url: string; label: string; waitFor?: string; fullPage?: boolean };

const SHOTS: Shot[] = [
  { file: "dashboard", url: "/", label: "대시보드 — KPI·미결·최근 트랜잭션" },
  {
    file: "w3071-order-progress",
    url: "/screens/W3071?searchFrom=2026-01-01&searchTo=2026-12-31",
    label: "주문진행현황 — 거래처 3단계 집계 + 오더라인 상세",
    waitFor: "main table",
  },
  {
    file: "w5071-stock-ledger",
    url: "/screens/W5071?sYear=2026&sMonth=8&tab=month",
    label: "재고 수불부 — 월별 피벗(2단 그룹헤더·좌측 고정열·합계행)",
    waitFor: "main table",
  },
  {
    file: "order-detail",
    url: "/screens/orders/16",
    label: "판매오더 상세 — 문서흐름(원천·후속) 링크",
    waitFor: "main",
  },
  {
    file: "order-new",
    url: "/screens/orders/new",
    label: "판매오더 입력 — 쓰기(ERP 엔진 경유)",
    waitFor: "form",
  },
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // 로그인 — 실제 '데모 계정으로 둘러보기' 버튼 경로를 그대로 탄다
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.addStyleTag({ content: HIDE_DEV_UI });
    await page.screenshot({ path: path.join(OUT, "login.png") as `${string}.png` });
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("데모 계정으로 둘러보기"),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) throw new Error("'데모 계정으로 둘러보기' 버튼을 찾지 못했습니다.");
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => undefined);
    if (new URL(page.url()).pathname === "/login") throw new Error("데모 로그인이 되지 않았습니다.");
    console.log(`  ok  로그인 (데모 버튼) → ${page.url()}`);

    for (const s of SHOTS) {
      await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle2" });
      await page.addStyleTag({ content: HIDE_DEV_UI });
      if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 15_000 });
      const file = path.join(OUT, `${s.file}.png`);
      await page.screenshot({ path: file as `${string}.png`, fullPage: s.fullPage ?? false });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`  ok  ${s.file}.png (${kb}KB) — ${s.label}`);
    }
    console.log(`\n✅ ${SHOTS.length + 1}장 생성 → docs/images/\n`);
  } finally {
    await browser?.close();
  }
}

main().catch((e) => {
  console.error("스크린샷 생성 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});

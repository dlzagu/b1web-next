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

/** 데스크톱 기본 폭. 피벗처럼 열이 많은 화면만 wide 로 넓혀 마지막 합계열까지 담는다 */
const VIEW = { normal: 1440, wide: 1680 } as const;

type Shot = {
  file: string;
  url: string;
  label: string;
  waitFor?: string;
  fullPage?: boolean;
  wide?: boolean;
  /** 캡처 전에 누를 버튼/탭의 텍스트 (탭은 클라이언트 상태라 URL 로 지정할 수 없다) */
  clickText?: string;
};

/** 버튼/탭을 텍스트로 찾아 누른다 — 못 찾으면 throw(캡처가 조용히 엉뚱한 탭을 찍는 것을 막는다) */
async function clickByText(page: import("puppeteer-core").Page, text: string): Promise<void> {
  const ok = await page.evaluate((t: string) => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!ok) throw new Error(`'${text}' 버튼/탭을 찾지 못했습니다.`);
  await new Promise((r) => setTimeout(r, 300));
}

/** 기간 파라미터는 시드 기준일이 실행 시점마다 밀리므로 '올해 전체'로 고정한다(상수 연도 금지) */
const YEAR = new Date().getFullYear();

const SHOTS: Shot[] = [
  { file: "dashboard", url: "/", label: "대시보드 — KPI·미결·최근 트랜잭션" },
  {
    file: "order-progress",
    url: `/screens/order-progress?searchFrom=${YEAR}-01-01&searchTo=${YEAR}-12-31`,
    label: "수주 진행 현황 — 거래처 3단계 집계 + 오더라인 상세",
    waitFor: "main table",
  },
  {
    file: "stock-ledger",
    url: `/screens/stock-ledger?sYear=${YEAR}&tab=month`,
    label: "재고 입출고 대장 — 월별 피벗(2단 그룹헤더·좌측 고정열·합계행)",
    waitFor: "main table",
  },
  {
    file: "sales-pivot",
    url: `/screens/sales-pivot?sYear=${YEAR}&tab=partner`,
    label: "매출 피벗 분석 — 행=거래처 × 열=월",
    waitFor: "main table",
    wide: true, // 1월~기준월 + 연간 합계까지 한 화면에
  },
  {
    file: "purchase-by-vendor",
    url: `/screens/purchase-by-vendor?searchFrom=${YEAR}-01-01&searchTo=${YEAR}-12-31`,
    label: "공급처별 매입 분석 — 매출 분석의 구매측 미러",
    waitFor: "main table",
  },
  {
    file: "stock-by-item",
    url: "/screens/stock-by-item",
    label: "품목별 재고 분포 — 행=품목 × 열=창고",
    waitFor: "main table",
  },
  {
    // 후속 납품이 달린 오더를 고른다 — 자식이 없는 문서를 찍으면 흐름 칸이 '-' 라 아무것도 안 보인다
    file: "order-detail",
    url: "/screens/orders/45",
    label: "판매오더 상세 — 문서흐름(원천·후속) 링크",
    waitFor: "main",
    clickText: "상세", // 흐름 링크는 '상세' 탭 안에 있다(클라이언트 탭)
  },
  {
    file: "order-new",
    url: "/screens/orders/new",
    label: "판매오더 입력 — 쓰기(ERP 엔진 경유)",
    waitFor: "form",
  },
];

/** 모바일(390x844) — 셸 전환(드로어)·폼·넓은 피벗까지 반응형이 실제로 버티는지 */
type MobileShot = { file: string; url: string; label: string; waitFor?: string; drawer?: boolean };

const MOBILE_SHOTS: MobileShot[] = [
  { file: "mobile-dashboard", url: "/", label: "대시보드 — KPI 카드가 1열로" },
  { file: "mobile-drawer", url: "/", label: "메뉴 드로어 — 사이드바 대체", drawer: true },
  { file: "mobile-orders", url: "/screens/orders", label: "판매오더 목록 — 그리드는 가로 스크롤 유지" },
  {
    file: "mobile-order-new",
    url: "/screens/orders/new",
    label: "판매오더 입력 — 폼이 1열로 접힘",
    waitFor: "form",
  },
  {
    file: "mobile-stock-ledger",
    url: `/screens/stock-ledger?sYear=${YEAR}&tab=month`,
    label: "재고 입출고 대장 — 넓은 피벗도 페이지는 안 넘침",
    waitFor: "main table",
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
    const desktop = (w: number) => page.setViewport({ width: w, height: 900, deviceScaleFactor: 2 });
    await desktop(VIEW.normal);

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
      await desktop(s.wide ? VIEW.wide : VIEW.normal);
      await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle2" });
      await page.addStyleTag({ content: HIDE_DEV_UI });
      if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 15_000 });
      if (s.clickText) await clickByText(page, s.clickText);
      const file = path.join(OUT, `${s.file}.png`);
      await page.screenshot({ path: file as `${string}.png`, fullPage: s.fullPage ?? false });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`  ok  ${s.file}.png (${kb}KB) — ${s.label}`);
    }
    // ── 모바일(390x844) — 반응형 셸: 사이드바가 헤더의 드로어로 바뀐다 ──
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    let overflow = 0;
    for (const s of MOBILE_SHOTS) {
      await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle2" });
      await page.addStyleTag({ content: HIDE_DEV_UI });
      if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 15_000 });
      if (s.drawer) {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find(
            (x) => x.getAttribute("aria-label") === "메뉴 열기",
          );
          b?.click();
        });
        await new Promise((r) => setTimeout(r, 400)); // 드로어 슬라이드 완료 대기
      }
      // 가로 스크롤이 생기면 반응형이 깨진 것 — 캡쳐와 함께 즉시 드러나게 로그로 남긴다
      const m = await page.evaluate(() => ({
        vw: window.innerWidth,
        docW: document.documentElement.scrollWidth,
      }));
      if (m.docW > m.vw) overflow += 1;
      await page.screenshot({ path: path.join(OUT, `${s.file}.png`) as `${string}.png` });
      console.log(
        `  ok  ${s.file}.png — ${m.docW > m.vw ? `⚠️ 가로 스크롤(${m.docW}>${m.vw})` : `가로 넘침 없음(${m.vw})`} — ${s.label}`,
      );
    }

    console.log(`\n✅ ${SHOTS.length + MOBILE_SHOTS.length + 1}장 생성 → docs/images/`);
    if (overflow > 0) console.log(`⚠️ 모바일 가로 넘침 ${overflow}건 — 반응형 회귀\n`);
    else console.log("");
  } finally {
    await browser?.close();
  }
}

main().catch((e) => {
  console.error("스크린샷 생성 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});

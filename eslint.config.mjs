import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 디자인 시스템 경계 강제 — 하드코딩 색상/임의색 클래스 금지.
// 색은 globals.css 토큰(@theme)만 사용: bg-surface, text-muted, border-border, rounded-card 등.
const noHardcodedColor = [
  {
    // 3~8자리 hex 모두 차단(#fff 단축형 포함 — 기존 6자리 전용 정규식 사각지대 보강).
    selector: "Literal[value=/#[0-9a-fA-F]{3,8}/]",
    message: "하드코딩 색상(hex) 금지 — globals.css 토큰(bg-surface·text-muted·border-border 등) 사용. 디자인 시스템 경계.",
  },
  {
    selector: "Literal[value=/-\\[#/]",
    message: "임의값 색상 클래스(text-[#..]·bg-[#..]) 금지 — 토큰 유틸 사용.",
  },
  {
    selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
    message: "하드코딩 색상(hex) 금지 — 토큰 사용.",
  },
  {
    selector: "TemplateElement[value.raw=/-\\[#/]",
    message: "임의값 색상 클래스 금지 — 토큰 사용.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 참고 자료(앱 코드 아님): Claude Design 핸드오프 번들·설계 문서
    "docs/**",
  ]),
  {
    name: "b1web/design-system-guard",
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...noHardcodedColor] },
  },
  {
    // 화면(page.tsx 등)에서는 raw <table> 금지 — 프리미티브 경유(Table/TableBare/DataGrid).
    name: "b1web/screens-no-raw-table",
    files: ["src/app/**/screens/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...noHardcodedColor,
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: "화면에서 raw <table> 금지 — @/components/ui Table/TableBare 또는 DataGrid 사용.",
        },
      ],
    },
  },
]);

export default eslintConfig;

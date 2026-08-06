// eslint flat config (eslint 10).
//
// 도입 이유: 저장소에 lint 가 없어서, prettier 가 `// eslint-disable-next-line` 주석을
// 다른 줄로 밀어내도 **아무도 잡아내지 못했다**. 실제로 CompanionOverlay.tsx 에서 억제 주석이
// 콜백 본문 안으로 밀려 억제 대상 줄이 바뀐 채로 커밋됐다. 전면 포맷을 하려면 이 부류를
// 기계가 검증해줘야 한다 — 테스트·빌드는 문법과 동작은 잡아도 억제 주석 이동은 못 잡는다.
//
// 포매팅 규칙은 prettier 가 소유한다(eslint-config-prettier 가 충돌 규칙을 끔).
// eslint 는 코드 품질만 본다 — 두 도구가 같은 줄을 두고 다투면 저장할 때마다 진동한다.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `_` 접두 인자는 "안 쓴다"는 의도를 코드가 이미 표시한 것 (예: handleAvatarLoad(url, _label))
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // ⚠️ `@typescript-eslint/no-explicit-any` 를 끄지 말 것.
      // three.js/VRM 경계의 any 캐스트는 불가피하지만(KTX2Loader 타입 충돌, gltf.userData.vrm
      // 등 — CLAUDE.md 「주의사항」), 코드베이스가 이미 **지점마다 억제 주석**으로 처리해 뒀다.
      // 규칙을 끄면 그 의도적인 주석 14개가 전부 "불필요한 disable" 경고로 뒤집힌다.
    },
  },
  {
    // node 스크립트. 단, puppeteer 스크립트는 `page.evaluate(() => window…)` 콜백을
    // **브라우저에서** 실행하므로 브라우저 전역도 함께 열어준다(안 그러면 no-undef 오탐 22건).
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettierConfig, // 항상 마지막 — 포매팅 관련 규칙을 전부 끈다
);

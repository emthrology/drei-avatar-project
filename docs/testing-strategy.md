# 테스트 전략 (AI 에이전트 주도 프로젝트)

## 왜 — 에이전트에겐 테스트가 "눈"

에이전트는 **실행 중인 앱을 못 본다.** tsc/build 통과 + 사람의 수동 확인에만 의존 → 사람이 봐주기 전까지 자율 피드백 루프가 없음. 게다가 에이전트는 한 번에 여러 파일을 빠르게 바꿔 회귀 위험이 큼. 반면 테스트는 싸게 작성·실행함. 그래서 테스트는 **덜이 아니라 더** 필요하고, 에이전트가 스스로 확인할 유일한 그물이다.

## 무엇을 테스트하나 — 순수 로직만

3D/실시간이라 "보이는 것"은 단위 테스트 불가. 갈라서 본다:

| 종류 | 예 | 테스트 |
|------|-----|--------|
| **순수 로직** | scheduler(보간/gaussian/sigmoid/pickAlt/factory), lipsyncEn(단어→viseme), store 액션, locales 맵 | ✅ 단위 (고ROI) |
| 통합(본 매핑) | channels.apply() — VRM stub 필요 | △ 선택 |
| 시각/렌더 | MToon 룩·카메라·그레이딩·투명도·모션 자연스러움 | ❌ 수동/시각회귀 |

## 계층형 그물

1. **tsc** (있음) — 가장 싼 그물. 타입을 좁힐수록(예: 채널명 union) 버그 종류가 통째로 사라짐
2. **순수 로직 단위 테스트** ← 투자 지점. 위험한 코어(scheduler·lipsyncEn)
3. 스모크 — 페이지 크래시 없이 마운트 (콘솔 에러 0)
4. 시각 회귀(선택) — Playwright 스크린샷. 설치비용 커서 나중
5. 수동 — "모션이 자연스러운가" 등 환원 불가한 것만

## 에이전트 거버넌스 (중요)

- **구현이 아니라 불변식을 테스트** — 에이전트는 현재 구현에 과적합한 테스트를 내기 쉬움. CLAUDE.md 불변식(채널 단일소유, hold-last, baseline 복귀)을 테스트로 인코딩 → 리팩토링해도 살아남는 사양
- **리팩토링 전 characterization 테스트** — 순수 로직의 현재 동작을 핀으로 고정 후 리팩토링 → "동작 불변"을 테스트가 증명(비퇴행 자동 검증)
- **공허한 테스트 경계** — 전부 mock하고 아무것도 단언 안 하는 테스트 금지. 함수를 일부러 깨면 빨개지는지 확인(뮤테이션 sanity)
- **결정성** — scheduler는 `Math.random` 사용 → 테스트에서 `vi.spyOn(Math,'random')`로 고정하거나 스칼라(비-ranged) 클립으로 결정적 입력 사용

## 현재 셋업

- **Vitest** (Vite 네이티브). `npm test`(1회) / `npm run test:watch`
- 테스트는 소스 옆 `*.test.ts` 코로케이션. vitest 심볼은 `import { describe, it, expect, vi } from 'vitest'`로 명시(전역 설정 불필요, tsc도 통과)
- 첫 대상: [scheduler.test.ts](../src/companion/anim/scheduler.test.ts), [lipsyncEn.test.ts](../src/companion/lipsyncEn.test.ts) — 순수·위험·에이전트가 못 보는 코어

## 안 하는 것 (의도적)

- 커버리지 100% 추구 X — 위험한 순수 코어에 집중
- React 글루(useAnimator 등)·렌더 결과는 단위 테스트 안 함 (수동/시각회귀 영역)

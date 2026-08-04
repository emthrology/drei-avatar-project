# 프로젝트 진단 (2026-08) — 7월 진단 이후 실행 대조

> ⏳ **유효기간: 2026-08-31까지.** 이후 삭제한다(결정은 2026-08-04). 살아있는 할 일은 이미 CLAUDE.md 로드맵 `[ ]` 3건으로 옮겼으므로, 이 문서가 사라져도 잃는 것은 서술 맥락뿐이다.
>
> **성격**: 진단·제안 문서. 7월 진단(`project-diagnosis-2026-07.md`, 이 문서로 대체되어 삭제 — `git log`)의 후속.
> 한 달간 무엇이 실행됐고 무엇이 남았는지 대조 → 갱신된 ROI 우선순위 제시.
> **baseline 검증(2026-08-04)**: `npm test` 26 passed (2 files) · `tsc -b` clean.

## Context

7월 진단이 ROI 순으로 4개 방향을 제안했다. 한 달 뒤 결과는 **2·3순위가 실행되고 1순위가 미착수**, 그리고 계획에 없던 5번째 작업(모션 자연스러움)이 추가됐다. 코드 자체는 여전히 건강하나, **기록 계층(CLAUDE.md·docs)이 실행 속도를 못 따라간 상태**가 이번 진단의 핵심이다.

---

## 1. 7월 진단 대조 (제안 vs 실행)

| 7월 순위 | 방향 | 실행 결과 | 커밋 |
|---|---|---|---|
| **1** | 스크린샷/내보내기 (Phase 4) | ❌ **미착수** — 인앱 스캐폴딩 여전히 0 | — |
| 2 | drei ①로딩% ②AdaptiveDpr | ✅ 완료 | `9ae4863` |
| 3 | 무드 5단계 루프 톤 분기 | ✅ 완료 | `e5d06b1` |
| 4 | 테스트/문서 위생 | ⚠️ **부분** — scheduler 테스트만 +86줄, 문서 stale 3건 미해결 | `9f65d9b` 일부 |
| (계획 외) | 모션 자연스러움 (overlap/smootherstep/micro-drift) | ✅ 완료 | `9f65d9b` |

**관찰**: 실행 순서가 ROI 순위와 역전됐다. 2·3·계획외 항목은 모두 `anim/` 도메인이라 컨텍스트 연속성이 좋았고, 1순위는 미착수됐다.

이후 착수 시점(2026-08-04)에 1순위를 재검토한 결과 **폐기**로 결론났다(§3.1). 즉 역전은 판단 실수가 아니라 **7월 진단의 1순위 지정 자체가 틀렸던 것**이다 — 명세 없는 플레이스홀더를 "미완 Phase"라는 이유만으로 최상위에 올렸고, 실제 용도를 심사하지 않았다. **교훈: "로드맵에 미완으로 남아 있음"은 ROI 근거가 아니다.** 원칙②는 항목의 존재가 아니라 용도로 판정해야 한다.

---

## 2. 진단표

| 영역 | 판정 | 근거 | ROI |
|------|------|------|-----|
| **CLAUDE.md 로드맵·불변식** | ⚠️ **주의** | 최근 2커밋(`9ae4863` drei, `9f65d9b` 모션)이 **체크박스·불변식 어디에도 미반영**. `smootherstep`/`overlap`/`micro-drift`/`AdaptiveDpr` 전부 CLAUDE.md에 0회 등장 | **높음** |
| ~~docs stale 참조~~ | ✅ **해소 → 이후 문서 자체를 삭제(2026-08-04)** | stale 5건을 고쳤으나, 곧이어 "이 문서들이 애초에 필요한가" 재검토에서 **7개 삭제** 결정 → §3.2 | — |
| **`docs/` 비대화** | ⚠️ **주의 → 정리 완료** | 16개·1,447줄 중 **10개가 CLAUDE.md 미링크**(발견 불가) + 3개가 스킬 references 사본. → 9개·987줄로 축소, 규칙 명문화 → §3.2 | **높음** |
| **`moods.ts` 747줄** | ⚠️ **분할후보** | 620줄 시점에 이미 "바뀌는 이유 5가지 → 응집 낮음"으로 라벨링됨(당시 `structure-criteria-examples.md`, 현재 삭제). 한 달 새 **+127줄**(무드 톤 분기·모션 자연스러움) | 중 |
| **테스트 커버리지** | ⚠️ 주의 | 여전히 2파일. `scheduler`는 잘 성장(26 tests)했으나 `store.ts`·`channels.ts`·`meshLabels.ts` 0 | 중 |
| ~~Phase 4 (스크린샷/내보내기)~~ | ❌ **폐기(2026-08-04)** | 명세된 적 없는 플레이스홀더. 해석 4안 전부 원칙② 미달 → §3.1 참조 | — |
| 아키텍처 (조립 엔진·anim 채널) | ✅ 적합 | 7월 평가 유효. 인라인 부채 TODO 1건([constants.ts:134](../src/editor/constants.ts#L134))뿐 | — |
| 빌드/테스트 baseline | ✅ 적합 | 26 passed · tsc clean | — |
| `tts-model-selection.md` | 📌 미커밋 | 조사 노트 성격, git 미추적 상태로 방치 | 낮음 |

---

## 3. 제안하는 길 (ROI 우선순위)

| 순위 | 방향 | 난이도 | 근거 |
|------|------|--------|------|
| **1** | **CLAUDE.md 동기화** ✅ 완료 | 매우 쉬움 | 에이전트 상시 컨텍스트가 2커밋만큼 낡음 = **다음 세션이 최신 불변식을 모른 채 `anim/`을 고칠 위험**. 가장 싸고 가장 위험한 항목 |
| **2** | ~~docs stale 정리~~ → **docs 감축** ✅ 완료 | 쉬움 | stale 수정으로 시작했으나 상위 질문("다 필요한가")으로 전환 → 16개→9개 삭제 + 생성 규칙 명문화. §3.2 |
| **3** | `moods.ts` 분할 | 중 | **다음 제스처/무드 추가 착수 직전**에 하는 게 정석(§1: "곧 할 변경을 막나?"). 지금 당장은 안 아픔 |
| 4 | 테스트 확장 (`store`/`channels`/`meshLabels`) | 쉬움 | 순수/준순수. 3번 분할 전 characterization으로 쓰면 일석이조 |
| ❌ 폐기 | ~~Phase 4 스크린샷/내보내기~~ | — | 원칙② 미달 → §3.1 |
| 보류 | IK 도입 | 어려움 | 7월 판단 유지 — 300×400 오버레이서 체감↓ |
| 보류 | 하반신 무게이동 | 큼 | 신규 본/채널 회귀 위험 ([motion-naturalness-plan.md](motion-naturalness-plan.md) 4번) |

**추천 시퀀스**: 1·2 완료. 3·4는 `anim/` 재착수 시점에 묶어서.

> 순위 1을 맨 앞에 둔 이유: 나머지 전부가 CLAUDE.md를 읽고 시작한다. 낡은 컨텍스트 위에서 하는 작업은 원칙①(비퇴행)을 구조적으로 위협한다.

### 3.1 폐기 기록 — Phase 4 스크린샷/내보내기 (2026-08-04)

**무엇을 시도했나**: 착수 전 "스크린샷/내보내기"의 출처를 추적한 결과 **명세가 존재하지 않음**을 확인. 초기 로드맵 플레이스홀더 한 줄([CLAUDE.md](../CLAUDE.md)) + 구현 메모(`drei-opportunities.md:52`, 이후 삭제) + 7월 진단의 추정 해석이 전부. 이에 해석을 4안으로 펼쳐 검토:

| 안 | 내용 | 난이도 | 판정 근거 |
|---|---|---|---|
| A | 캔버스 PNG 캡처 (7월 진단의 해석) | 낮음 | OS 스크린샷으로 대체. 차별점(UI 없는 순수 렌더·DPR 고해상도·투명배경)의 **용도가 없음** |
| B | 조합 설정 JSON 저장/복원 | 낮음 | 영속성 부재를 풀 수 있었으나 **요구되지 않음** |
| C | 조립 VRM/GLB 익스포트 | **높음** | MToon·스프링본 보존 문제. 사용 맥락 없음 |
| D | 컴패니언 투명 PNG | 낮음 | A의 변형 |

**왜 폐기했나**: 근본 원인은 "미완 Phase가 남아 있다"는 **로드맵상의 공백감**이었지 실제 불편이 아니었다. 4안 모두 원칙②(실질 개선)에 미달 → 방법론 §0에 따라 **안 만드는 것이 정답**. 7월 진단이 이를 "1순위·체감가치 높음"으로 올린 것은 해석 A를 확정 스펙처럼 다룬 판단 착오였다.

**재개하려면**: 재개 트리거는 "미완 Phase"가 아니라 **구체적 용도**다 — 예: 카탈로그 홍보 이미지가 필요해짐(→A), 조합 프리셋을 남과 공유해야 함(→B), 조립 결과를 게임 엔진에 투입(→C). 그때는 신규 제안으로 다루고 이 폐기 판단을 번복 근거와 함께 갱신한다. 오프라인 렌더가 필요할 뿐이면 **이미 있는** [scripts/renderThumbs.mjs](../scripts/renderThumbs.mjs)(puppeteer + `?thumb=` 단독 렌더) 재사용이 정답.

**미해결로 남긴 관찰**: 영속성 전무(`persist`/`localStorage` grep 0건) → 새로고침 시 파츠 조합·메시별 색·셰이더·조명·그레이딩 전부 초기화. B가 이를 풀 수 있었으나 기능 불필요 판정에 따라 **의도적으로 남긴 상태**. 실제 불편으로 드러나면 그때 재검토.

### 3.2 폐기 기록 — docs 7개 삭제 (2026-08-04)

**계기**: stale 참조 정리를 마친 직후 사용자가 "이게 다 필요한 것들인가, 스킬 기획이 잘못된 건가"를 제기. 측정해보니 **16개·1,447줄 중 10개가 CLAUDE.md에서 링크되지 않았다** — 새 세션이 발견조차 못 하는 상태. 발견되지 않는 문서는 "다음 변경을 쉽게 한다"는 목적에 기여할 수 없다.

| 삭제 | 사유 |
|---|---|
| `code-structure-guide.md` | `/project-methodology` 스킬 `references/structure-criteria.md`의 **로컬 사본**(5기준·냄새·오해 거의 축자 동일) |
| `testing-strategy.md` | 스킬 `references/testing-strategy.md` 사본. **프로젝트 고유분(콜로케이션·`vi.spyOn(Math,'random')`)만 CLAUDE.md로 흡수** |
| `structure-criteria-examples.md` | 위 둘의 적용 예시. 지적한 3건 중 2건이 이미 해소돼 남은 건 `moods.ts` 하나 → 진단서로 승계 |
| `refactor-diagnosis.md` | 2026-06 구조 진단, 대체됨. **아카이브 배너를 달았다가 곧 삭제** — `git log`가 이미 하는 일이었다 |
| `project-diagnosis-2026-07.md` | 이 문서가 대체 |
| `canvas-resolution-notes.md` | 결론(해상도 차이는 버그 아님 + dpr 상향 시 거버너와 맞물림)만 **CLAUDE.md 1줄로 흡수** |
| `drei-opportunities.md` | ①②는 구현 완료, `<AdaptiveDpr>` 함정은 이미 CLAUDE.md 로드맵 항목에 기록됨. 남은 ③④⑤는 착수 근거 없음 |

**근본 원인 (스킬 설계)**: `/project-methodology`는 문서를 **만드는 규칙**(5개 템플릿)과 **유지하는 규칙**(stale 검사)은 갖췄으나 **버리는 규칙이 없다.** 단조 증가가 설계에 내장돼 있었다. 크기 비례 규칙도 없어 한 줄이면 될 것이 문서 하나가 됐다. → 스킬 §3에 「문서를 버릴 때」 절 추가로 대응.

**부수 원인 (적용 과실)**: 스킬 §4가 남기라는 건 *실수*가 아니라 **재논의 비용이 있는 결정**인데, 템플릿을 기계적으로 채웠다. 같은 세션에서 Phase 4 폐기를 CLAUDE.md와 §3.1 **두 곳에** 쓴 것이 그 사례 — 재논의 차단 목적엔 CLAUDE.md 한 곳이면 족했다.

**앞으로의 기준** (CLAUDE.md 「문서 작성 기준」에 명문화):
ⓐ git이 기록한 것은 문서로 안 남긴다(아카이브 배너 < 삭제) · ⓑ CLAUDE.md 한 줄이면 문서를 안 만든다 · ⓒ 스킬 references와 중복 사본 금지 · ⓓ **"이 문서가 다음 세션의 결정을 바꾸는가?"** 아니면 버린다.

**남긴 9개의 근거**: 진행 중 작업의 계획서(`motion-naturalness-plan`·`mood-plan`·`idle-arm-plan`·`ik-plan`) · 재시도 차단용 실패기록(`wave-gesture-attempts`) · 폐기 근거(`shader-features-plan`) · 현행 진단(이 문서) · 이식 조사(`tts-model-selection`) · 학습 자료(`concepts`).

---

## 4. 착수용 seam

### 1. CLAUDE.md 동기화
- **로드맵 체크박스 2건 누락** — [CLAUDE.md:231](../CLAUDE.md#L231)과 [:233](../CLAUDE.md#L233) 사이에 추가:
  - drei 로딩 인디케이터 + FPS 적응형 DPR (`9ae4863`)
  - 모션 자연스러움 — overlap/smootherstep + micro-drift + idle 다양화 (`9f65d9b`)
- **anim/ 불변식 섹션 보강** — 「애니메이션 스케줄러(anim/) 불변식」에 `9f65d9b`가 도입한 규칙 반영. 근거 코드: [scheduler.ts](../src/companion/anim/scheduler.ts)(+93줄, 보간·이징 변경) · [useAnimator.ts](../src/companion/anim/useAnimator.ts)(+227/-대폭 개편) · [channels.ts](../src/companion/anim/channels.ts)(+66)
- 관련 기록: [motion-naturalness-plan.md](motion-naturalness-plan.md) · [wave-gesture-attempts.md](wave-gesture-attempts.md)(실패 기록 — wave 보류, 주석 코드 위치 포함)
- 메모리 [[motion-smoothness-not-overshoot]]와 일관성 확인

### 2. docs 감축 — ✅ 완료 (2026-08-04) · 상세는 §3.2

stale 참조 5건 수정으로 시작했으나, 그 작업 자체가 "**이 문서들이 애초에 필요한가**"라는 상위 질문을 불러 **7개 삭제**로 귀결됐다. 삭제된 문서에 가한 stale 수정은 버려졌다 — 순서를 뒤집었다면(필요성 판단 → 정리) 그 작업이 없었을 것이다. §3.2 참조.

**결과**: 16개·1,447줄 → **9개·987줄**. 링크 전수 검증 통과(깨진 링크 0).

### 3. moods.ts 분할 (착수 시)
현 구성 — 한 파일에 5종류가 공존:
- `IDLE_SPINE_POSES`([moods.ts:62](../src/companion/anim/moods.ts#L62)) / `IDLE_ARM_POSES`([:157](../src/companion/anim/moods.ts#L157)) / `IDLE_POSES`([:230](../src/companion/anim/moods.ts#L230))
- 제스처 + `WAVE`([:456](../src/companion/anim/moods.ts#L456), 보류·주석) + 무드별 톤([:479](../src/companion/anim/moods.ts#L479))
- 타입([:635-655](../src/companion/anim/moods.ts#L635-L655))
- 루프 톤 분기([:655](../src/companion/anim/moods.ts#L655)) · `TONE_LOOP_NAMES`([:700](../src/companion/anim/moods.ts#L700)) · `MOODS` 조립([:713](../src/companion/anim/moods.ts#L713))

분할 후보: `anim/poses.ts`(idle 3종) / `anim/gestures.ts` / `anim/moods.ts`(타입+톤+조립). **순수 이동 먼저**(§0), 로직 변경은 그 다음 PR.

### 4. 테스트 확장 후보 (순수/준순수)
- [store.ts](../src/store.ts) — `setCharacter` 리셋, mesh patch
- [channels.ts](../src/companion/anim/channels.ts) — 논리 채널 → 본 매핑 테이블
- [meshLabels.ts](../src/editor/meshLabels.ts) — `LABEL_RULES` 매칭·fallback (48줄, 순수 규칙 = 최고 ROI)

---

## 5. 미결 항목

- **[tts-model-selection.md](tts-model-selection.md) 미커밋** — 실수요 이식용 TTS 백엔드 조사 노트(조사 노트 포맷). 현 코드에 영향 없는 참고 자료이나, git 미추적으로 두면 유실 위험. 커밋 여부 결정 필요.

## 검증 (각 방향 실행 시)

- `npm test` + `npm run build`(tsc) 통과 — 현 baseline 26 passed / clean
- 수동: 에디터/컴패니언 양쪽 기존 동작 불변 확인
- 비퇴행(원칙①): 정적 편집 · 립싱크 · 무드 표정/제스처 · idle 루프 톤 불변

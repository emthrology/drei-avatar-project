# 모션 자연스러움 개선 계획 (탈로봇)

## 문제 제기 (2026-07-08)

무드 루프 톤 분기까지 넣어 상당히 부드러워졌으나, 아직 인간다운 동작엔 못 미침. 눈에 띄는 증상 3가지:

1. **동작→동작 전환이 경직** — 로봇처럼 움직임
2. **idle 자세 부족**
3. **더 액티브한 몸동작 필요**

이 문서는 위 증상을 코드상 **근본 원인**으로 환원하고, 우선순위와 착수 방식을 정리한다.
관련 코드: [scheduler.ts](../src/companion/anim/scheduler.ts) · [moods.ts](../src/companion/anim/moods.ts) · [channels.ts](../src/companion/anim/channels.ts) · [useAnimator.ts](../src/companion/anim/useAnimator.ts).

## 증상 → 근본 원인 매핑

증상 3개는 표면이고, 코드상 원인은 5개로 수렴한다.

### 원인 A — 한 클립의 전 채널이 같은 시계 (overlap 없음) 〔증상 1〕
[moods.ts](../src/companion/anim/moods.ts) 제스처(예 왼손짓)는 `armL.z`·`elbowL.z`·`chest.turnY`·`chest.leanZ`가 **동일한 `dt` 타임라인**을 공유 → 동시 출발·동시 정지·동시 복귀. 사람 몸은 몸통→어깨→팔꿈치→손 순서로 **시차(proximal-to-distal lag)**를 갖는다. 이 시차 부재가 "한 덩어리로 움직이는" 로봇감의 최대 원인. (애니메이션 12원칙: *overlapping action / follow-through*)

### 원인 B — 종료 시 오버슈트/세틀 없음 〔증상 1〕
이징이 [scheduler.ts](../src/companion/anim/scheduler.ts) `sigmoidFactory`의 대칭 ease-in-out → 목표점에서 **딱 멈춤**. 실제 팔은 목표를 살짝 지나쳤다 감쇠 진동으로 정착(spring/damping). 대칭 이징 = 기계적 정지. (12원칙: *slow in & out* 은 있으나 *follow-through* 의 overshoot 이 없음)

### 원인 C — hold 구간 완전 정지 〔증상 1〕
제스처 `vs: [out, hold, rest]`의 hold 세그먼트는 두 키프레임 값이 같아 [scheduler.ts](../src/companion/anim/scheduler.ts) `tick`이 상수 출력 → 팔이 **움직임→얼어붙음→복귀**. 그 사이 머리(idle 미동)는 계속 움직여, 부위별로 살았다 죽었다 하는 대비가 눈에 띈다.

### 원인 D — idle 팔의 지배 자세가 "차렷" 〔증상 2〕
[moods.ts](../src/companion/anim/moods.ts) `armRelaxed`가 **p=0.72**로 지배 → 대부분 시간을 차렷+미세이동으로 서 있음. 차렷은 인간이 가장 안 취하는 뻣뻣한 자세. 사람 idle은 팔짱·턱 괴기·한 손으로 반대팔 잡기 등 **비대칭 안정 자세**를 쓴다. 현재 비대칭 자세는 허리짚기/뒷짐뿐이고 빈도도 낮음.

### 원인 E — 전부 상반신 FK, 하반신·무게중심 없음 〔증상 3〕
`pose` 루프가 Spine만 회전 → 체중 이동이 아니라 "뻣뻣한 상체 흔들기". 골반·무릎·무게중심이 없어 액티브함에 구조적 천장이 있음. (진폭만 키우면 오히려 부자연)

## 우선순위

체감 개선 대비 공수 기준. **1번이 결정적** — overlap+오버슈트만 넣어도 기존 제스처 전부가 소급 개선된다.

| 순위 | 항목 | 겨냥 원인 | 효과 | 공수 | 비퇴행 |
|------|------|----------|------|------|--------|
| **1** | **채널 시차(overlap) + 오버슈트 세틀** | A, B | 로봇감 대부분 제거 | 중 | ✅ 스케줄러 확장, moods 데이터 무변경 |
| **2** | **hold 중 미세 드리프트** | C | "얼어붙음" 제거 | 소 | ✅ 저진폭 레이어 |
| **3** | **idle 팔 자세 다양화** | D | idle이 살아남 | 소 | ✅ moods 카탈로그 추가 |
| 4 | 하반신 무게이동 (골반/무릎) | E | 액티브함 천장 상승 | 대 | ⚠️ 채널/본 신규 |

우선 **1→2→3** 착수 권장. 4번은 하반신 본 검증·신규 채널이 필요해 별도 단계(원인 E는 상한 해소용, 급하지 않음).

## 1번 상세 — 채널 시차 + 오버슈트 (핵심)

### 방식: 스케줄러 확장, `moods.ts` 데이터 무변경
기존 제스처/루프 데이터를 안 건드리고 [scheduler.ts](../src/companion/anim/scheduler.ts)에 두 메커니즘을 얹어 **전 클립에 소급 적용**. 원칙1(비퇴행): 오프셋·오버슈트 파라미터의 기본값을 0/off로 두면 현재 동작과 바이트 동일 → opt-in.

### (a) per-channel 시차 (overlap)
- 클립 인스턴스화(`factory`) 시 채널별로 작은 시간 오프셋을 부여 → `absTs`를 채널마다 shift.
- 오프셋 규칙은 **채널의 운동학적 깊이**로 결정: 몸통(chest/spine) 0 → 상완(arm) +Δ → 팔꿈치(elbow) +2Δ → 머리(head.g*)는 별도. Δ≈40~90ms 범위.
- 깊이 맵은 채널명 프리픽스 기반 상수 테이블([channels.ts](../src/companion/anim/channels.ts) 근처 또는 scheduler)로. 미지정 채널=0(비퇴행).
- ⚠️ **채널 단일 소유 불변식 유지**: 오프셋은 타임라인만 밀 뿐 채널 소유를 안 바꿈. hold-last 연속성도 그대로.

### (b) 부드러운 정착 이징
- ⚠️ **초기 시도(오버슈트) 폐기.** backInOut(anticipation+overshoot)를 넣었더니 오히려 "각지고 절도있는 군인 동작"이 됨 — 오버슈트/선눌림은 *스냅*을 강조해 부드러움과 정반대. (2026-07-08 육안 피드백)
- 채택: **smootherstep**(Perlin, 양 끝 1·2차 도함수 0)로 본 채널 이징을 블렌드 → 급가감속·스냅 제거, 완만한 출발·정착. 오버슈트/anticipation 없음. `smooth?: number`(0~1) 블렌드 비율로 opt-in(기본 0=sigmoid, 비퇴행).
- 덤: ease 없는 idle 루프는 기존 steep한 `sigmoid(7)`을 쓰는데 smooth가 여기도 적용돼 idle 머리/포즈도 부드러워짐.

### 검증
- `scheduler.test.ts` 콜로케이트 유닛 테스트: 오프셋 0·overshoot 0일 때 기존 출력과 동일(비퇴행 회귀 테스트), 오프셋>0일 때 채널별 시작 시각 분리 확인.
- DebugPanel 제스처 버튼으로 육안 검증(왼손짓·손가슴에서 팔꿈치 지연/손 오버슈트 확인).

## 2번 상세 — hold 중 미세 드리프트

- held 상태(제스처 hold, idle 팔 포즈 유지)의 팔/몸통 채널에 **저진폭·저주파 노이즈**를 상시 가산 → 정지 구간에도 미세하게 살아있음.
- 구현 후보: (i) `apply` 직전 채널값에 채널별 위상차 사인 노이즈 레이어 가산, 또는 (ii) 스케줄러에 상시 도는 초저진폭 `microdrift` 루프.
- 진폭은 head 미동(±0.03~0.09)보다 작게(±0.01 수준) — 인지 가능하되 산만하지 않게.
- 원칙2(실질 개선): "얼어붙음" 대비가 사라지는지 육안 확인 후 채택.

## 3번 상세 — idle 팔 자세 다양화

- [moods.ts](../src/companion/anim/moods.ts) `IDLE_ARM_POSES`에 **비대칭 안정 자세** 추가: 팔짱(양 상완 앞·팔꿈치 크게 굽힘 교차), 한 손으로 반대팔 잡기, (프레임 하단이라 절제된) 손 앞으로 모으기.
- `armRelaxed` p=0.72 → ~0.5로 낮춰 차렷 지배 완화. 나머지 확률을 신규 비대칭 자세에 분배.
- **불변식 준수**: 각 포즈는 [idle-arm-plan.md](idle-arm-plan.md)대로 **양팔 전 채널 명시**(잔상 방지). speaking=rest 양보 유지. `IDLE_ARM_POSES`에 넣으면 DebugPanel `companion:idlepose` 버튼 자동 생성 → 축/진폭 검증.
- 검증축(CLAUDE.md): UpperArm z=들기/x=앞뒤(음수=앞), LowerArm z=굽힘(좌−/우+). 팔짱=양 상완 앞(x−)+팔꿈치 큰 굽힘.

## 4번 (보류) — 하반신 무게이동

- 원인 E 해소용. Hips/UpperLeg/LowerLeg 본 회전축을 male_sample에서 시각 검증 후 `hips.*`·`knee.*` 채널 신설.
- 체중 이동: 한 다리에 무게 → Hips 좌우 이동+회전, 반대 무릎 살짝 굽힘, Spine 보상. `pose` 루프와 연동.
- 신규 본/채널이라 회귀 위험 → 1~3 안정화 후 별도 착수. IK([ik-plan.md](ik-plan.md))와 별개(FK로 충분).

## 단계

1. docs (이 문서)
2. ✅ **1번**: `scheduler.ts` per-channel 오프셋 + 오버슈트 이징 (opt-in, 기본 비퇴행) + `scheduler.test.ts` 회귀/신규 테스트 — **완료**
3. ✅ **2번**: hold 미세 드리프트 레이어 — **완료**
4. ✅ **3번**: `moods.ts` 비대칭 idle 자세 + `armRelaxed` 확률 조정 — **완료**
5. 빌드 + DebugPanel 육안 튜닝 (제스처/idle포즈 버튼)
6. (보류) **4번**: 하반신 채널 — 별도 계획

## 1번 구현 결과 (2026-07-08)

- [scheduler.ts](../src/companion/anim/scheduler.ts): `MotionConfig{overlap,smooth}` 추가(기본 0=off, 바이트 동일). `channelDepth`(torso 0·arm/head 1·elbow 2)로 채널별 시작 지연(overlap). 본 채널 이징을 `baseEasing`↔`smootherstep` 블렌드(smooth)로 부드럽게. 얼굴(`blink`/`emo.*`)은 `isFacial`로 제외 → 항상 sigmoid(표정 동기). `tick`은 채널별 유효시각(et=clock−offset)으로 세그먼트 개별 탐색, 클립 수명은 `maxOffset` 연장.
- [useAnimator.ts](../src/companion/anim/useAnimator.ts): 앱 스케줄러에 `{overlap:50, smooth:1}` 활성 (테스트는 config 미지정=off → 비퇴행 유지).
- **1차 시도(overshoot) 반려**: `{overlap:60, overshoot:0.7}`은 "군인처럼 각짐" 피드백 → smooth(smootherstep)로 교체. overshoot 개념 완전 제거.
- 테스트: 총 26개 통과. 비퇴행(off=미지정 동일)·overlap 지연/수명연장·smooth 단조 정착(오버슈트 없음)·얼굴 채널 제외 커버.
- ⚠️ **육안 튜닝 남음**: overlap/smooth 상수(현재 35/0.7)는 초기값. 여전히 딱딱하면 overlap↓ 또는 idle 진폭·타이밍(`moods.ts`)이 다음 후보.

## 2번 구현 결과 (2026-07-08)

- [channels.ts](../src/companion/anim/channels.ts): `apply(state, t)`에 **micro-drift 레이어** 추가. `DRIFT` 맵(채널별 [주파수,위상,진폭])의 초저주파 sine을 최종 euler에 상시 가산 → hold(제스처 정지·포즈 유지) 구간에도 팔·팔꿈치·몸통이 미세하게 살아있음. 활성 모션 땐 진폭에 묻혀 hold 때만 보임(hold 감지 불필요).
- **불변식 안전**: apply-레이어라 스케줄러 채널 단일 소유와 무관. `tick` 반환 state는 `scheduler.live`와 동일 참조 → **mutate 금지**, drift는 euler 로컬에만 가산(hold-last 비오염). 대상=arm/elbow/chest.lean/spine.y·z. **제외**=머리(이미 미동)·얼굴(blink/emo, 표정 동기)·chest.inhale(호흡 진동). 서로 안 맞아떨어지는 주기(≈5~12s)로 반복감 제거. `DRIFT_AMP=0`이면 완전 무영향(비퇴행).
- [useAnimator.ts](../src/companion/anim/useAnimator.ts): `driftTRef`로 시간 누적 → `apply(state, t)` 전달.
- 테스트 26개 통과·타입체크 클린(Channels는 VRM 의존이라 유닛 미대상 — 육안 검증 영역).
- ⚠️ **육안 튜닝 남음**: 진폭(0.005~0.008rad)은 초기값. 너무 흐물거리면 `DRIFT_AMP`↓, 안 보이면 진폭↑.

## 3번 구현 결과 (2026-07-08)

- [moods.ts](../src/companion/anim/moods.ts) `IDLE_ARM_POSES`에 **앞으로모으기**(양손 몸 앞 하단 맞잡음) 추가. 검증축 준수(arm.z 들기·arm.x 음수=앞·elbow.z 굽힘 좌−/우+), **양팔 6채널 전부 명시**(잔상 방지).
- ⚠️ **팔짱·한손잡기 반려**(2026-07-08 피드백): 둘 다 팔이 몸 앞을 가로지르는 FK → 클리핑 + '손가슴' 제스처와 시각 중복. 몸을 안 가로지르는 앞으로모으기만 잔류. 비대칭은 기존 허리짚기(L/R)가 담당.
- `armRelaxed` 확률 **0.72 → 0.55** (차렷 지배 완화). 분배: 차렷 0.55 / 허리짚기L·R 0.05 / 뒷짐 0.15 / 앞으로모으기 0.2(잔여). 차렷도 micro-drift로 미세 흔들림(정지 아님).
- **불변식 준수**: `IDLE_ARM_POSES` 소속이라 speaking=rest 양보 유지(제스처가 팔 소유). `IDLE_POSES`(=arm+spine)에 자동 합류 → DebugPanel 버튼 자동 생성(팔짱/한손잡기/앞으로모으기 트리거 검증).
- 테스트 26개 통과·타입체크 클린.
- ⚠️ **육안 튜닝 남음**: FK 근사라 팔뚝 교차·클리핑은 DebugPanel 버튼으로 각 포즈 확인 후 각도(arm.x/elbow.z) 미세조정. 300×400 프레임서 손끝 정밀도는 비중요(전역 편안한 손으로 충분).

## 남은 것

- **4번(하반신 무게이동)**: 보류 유지 — 신규 본/채널 회귀 위험. 1~3으로 상반신 자연스러움 목표 상당 달성. 필요 시 별도 착수.

## 원칙 체크 ([[feature-dev-principles]])

- **비퇴행**: 1·2번은 파라미터 기본값 off → 기존 출력 바이트 동일에서 출발. 3번은 확률 재분배(차렷 자체는 잔존). 무드 톤 분기·립싱크·시선과 채널 비충돌.
- **실질 개선**: overlap/오버슈트는 "로봇 vs 생물"을 가르는 인지 지점 → "개발만 되는" 기능 아님. 각 단계 DebugPanel 육안 검증으로 체감 확인 후 채택.

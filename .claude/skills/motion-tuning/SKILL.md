---
name: motion-tuning
description: 절차 애니메이션의 자연스러움·부드러움·타이밍을 튜닝할 때의 불변식. scheduler 의 overlap/smooth, channels 의 본 파생(DeriveConfig)·자세 동요(DRIFT), npm run motion:stat 프로파일러를 만질 때, 또는 아바타가 로봇 같다·얼어붙는다·부유감이 난다는 문제를 다룰 때 사용한다.
---

# 모션 레이어 = 데이터 무변경 소급 적용

자연스러움은 **개별 클립 저작이 아니라 스케줄러/apply 레이어**에서 전 클립에 소급 적용한다.
새 파라미터는 **기본값 no-op**(off 일 때 기존 출력 바이트 동일)으로 두고 `useAnimator` 에서만
활성화 → 테스트는 config 미지정=off 로 비퇴행을 고정한다
([scheduler.test.ts](../../../src/companion/anim/scheduler.test.ts)).

`moods.ts` 의 클립 데이터를 고쳐서 자연스러움을 얻으려 하지 말 것. 그러면 클립마다 다시 해야 한다.

## 레이어별 불변식

- **overlap(시차)**: `MotionConfig.overlap`(현재 35ms) × `channelDepth`(torso 0 · arm/head 1 · elbow 2)만큼 채널 시작을 지연 → 몸통→팔→손 proximal-to-distal lag. `tick` 은 채널별 유효시각(`et = clock − offset`)으로 세그먼트를 **개별 탐색**하고 클립 수명은 `maxOffset` 만큼 연장. **채널 소유·hold-last 불변**(타임라인만 밀림)
  - ⚠️ **35ms 를 건드리지 말 것 — 부드러움 격차의 원인이 아님이 실측됐다.** VRMA 의 근위→원위 시차를 속도 상호상관으로 재보니 클립마다 −33ms~+1000ms 로 **일관성이 없다**(식별 불가). 여기를 튜닝해 자연스러움을 얻으려는 시도는 근거가 없다
- **smooth(정착)**: `MotionConfig.smooth`(현재 0.7)로 본 채널 이징을 `baseEasing`↔`smootherstep` 블렌드. **오버슈트/anticipation 금지** — 시도 후 "각진 군인" 느낌으로 반려됨. 부드러움은 오버슈트가 아니라 **양 끝 도함수 0**으로 얻는다
- **얼굴 채널 제외**: `isFacial`(blink/`emo.*`)은 overlap·smooth 미적용, 항상 sigmoid — 표정은 이벤트와 **동기**돼야 한다
- **본 파생(`DeriveConfig`)**: 채널→본 오일러 변환은 [channels.ts](../../../src/companion/anim/channels.ts) `boneEulers()` **단일 함수**가 전담하고, 그 안에서 기존 채널로부터 신규 본을 만든다 — 목 분배(head→Head/Neck 0.65/0.35) · 어깨 추종(상완 **baseline 대비 편차**의 0.33) · UpperChest 분배(spine 의 0.25). 원칙은 **총 회전량 유지**(새 본이 가져간 몫만큼 원 본에서 뺀다) → 실루엣 불변, 관절만 분절. 계수 0 = 파생 본을 **기록조차 안 함** = 기존 출력 바이트 동일
  - ⚠️ 모델에 없는 본(Neck/UpperChest/Shoulder 는 VRM 선택 본)에 몫을 떼주면 회전이 증발한다 → `Channels` 생성자가 결측 본 계수를 0으로 낮춘다
  - ⚠️ 신규 본은 VRMA 레이어 「소유 판별」 결과를 바꾼다(복귀 목표 rest0→live) — 본 추가 시 `npm run verify` 로 손인사 복귀를 재검증한다(`vrma-motion` 스킬)
- **프로파일러는 사본을 안 만든다**: `npm run motion:stat` 이 `boneEulers`·`driftAt` 을 apply 와 **같이** 호출한다. 새 본/채널을 추가하면 프로파일에 자동 반영 — 표를 별도로 손댈 일이 없다(사본을 두면 사본만 조용히 낡는다)
- **자세 동요(`DRIFT`)**: [channels.ts](../../../src/companion/anim/channels.ts) 의 저주파 진동을 `boneEulers` 가 **파생까지 끝낸 뒤 본 축(`<본>.<축>`) 단위로** 최종 euler 에 상시 가산 → 루프의 평평한 구간(제스처 정지·포즈 유지)도 얼지 않는다. 활성 모션 땐 진폭에 묻혀 **hold 감지 불필요**. 제외=얼굴(표정 동기)·손목(상완 동요가 FK 전달)·`chest.inhale`(이미 진동)
  - ⚠️ `tick` 반환 state 는 `scheduler.live` **동일 참조 → mutate 금지**(euler 로컬에만 가산)
  - ⚠️ `DRIFT_AMP=0` 이면 완전 무영향 — **부유감이 나면 여기부터 0으로 내려 원인을 격리하고, 진폭을 낮춘다(속도가 아니라)**
- **동요 설계 규칙 3가지** (실측): ⓐ**축당 4성분 합성** — sine 하나는 반주기마다 속도가 0을 지나 정지가 남는다(진폭을 키워도 짧아질 뿐) ⓑ**진폭은 `a ∝ 1/f`** 로 깔아 성분별 속도 기여를 균등하게 — 성분 수보다 **축별 속도 크기**가 지배적이다(1/√f 배분은 성분을 늘리고도 최장 정지가 3.75→5.97s 로 악화) ⓒ**채널이 아니라 본에 더한다** — 채널에 더하면 분배 계수만큼 쪼개져 두 본이 같은 파형을 공유한다
  - ⚠️ **속도를 얻으려고 주파수만 올리지 말 것** — 진폭 0.1° 짜리 빠른 성분은 지표만 통과시키고 눈엔 안 보인다(문턱 0.5°/s 는 **인지** 기준). 대역 0.5~2.6 rad/s · 축당 진폭 0.95~1.41° 가 그 선

## 측정

`npm run motion:stat`(약 2초, 브라우저 없음) — 본별 정지 비율·평균/최대 각속도·최장 정지 +
전역 버스트 집중도·구동 본 수. 예산 단정문은 `npm test` 에 포함된다.

- **단일 시드로 변경 전후를 비교하면 안 된다** — 근거는 [motionProfile.ts](../../../src/companion/anim/motionProfile.ts) `profileMean` 주석에 있다(클립 추가·분포 변경이 `Math.random` 소비 수를 바꿔 시드가 같아도 스트림이 어긋난다). 예산 판정은 `profileMean(BUDGET_SEEDS)` 로만
- **예산은 가드레일이지 래칫이 아니다** — 통과시키려고 완화하지 않고, 반대로 실측값에 바짝 붙여 조이지도 않는다. 이력과 근거는 [motionProfile.test.ts](../../../src/companion/anim/motionProfile.test.ts) 주석
- 현재 수치(참고): 구동 본 11/13 · 버스트 상위5% 26.7% · 최장 정지 3.91s · 최대 각속도 103.5°/s (VRMA_03 실측은 각각 51/52 · 31.6% · 0.29s · 49°/s)

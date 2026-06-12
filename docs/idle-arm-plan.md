# idle 자연스러운 팔 동작 계획 (FK)

## 목표

차렷으로 고정돼 있던 idle 팔에 생활감 부여 — 사람이 서 있을 때처럼 가끔 **허리 짚기 / 뒷짐 / 몸 비틀어 둘러보기**, 그리고 **상시 팔 미세 무게이동**.

## 방식: FK-우선 (IK 미사용)

[AskUserQuestion 결정] 검증된 스케줄러/채널 재사용. 신규 의존성·아키텍처 변경 0 → 기존 idle/제스처 비퇴행([[feature-dev-principles]] 원칙1). 손끝 정밀도는 300×400 오버레이서 안 보여 FK 근사로 충분(손가슴과 동일 논리, 원칙2). IK는 FK가 어색할 때만 Phase 2 ([ik-plan.md](ik-plan.md)).

## 구조 (기존 불변식 준수)

### 신규 `armPose` 루프 → BASE_LOOPS에 추가
- **idle 상태**: alt 분기로 랜덤 전환
  - 차렷+미세이동 (p 0.5, 길게 유지) — `armL/R.z`에 작은 gaussian → **팔 미세 무게이동**
  - 허리짚기L / 허리짚기R / 뒷짐 (나머지 확률 분배)
  - 각 포즈는 **양팔 채널 모두 명시**(포즈 안 하는 팔은 rest) → 연속 포즈 시 한 팔이 들린 채 남는 것 방지
- **speaking 상태**: arms rest(차렷) → 제스처에 팔 양보
  - 제스처는 큐 후순위(루프는 생성 시, 제스처는 발화 시 add)라 **per-channel 후순위 승** → speaking 중 팔은 제스처가 소유, 제스처 없을 땐 armPose가 rest 유지

### 몸 비틀어 둘러보기 → 기존 `pose` 루프에 alt 추가
- Spine은 이미 `pose`가 단독 소유 → 큰 `spine.y`(±0.35) 분기 2개 추가(좌/우, 낮은 확률). 머리는 FK로 따라옴 → 둘러보기/뒤돌아보기 느낌. IK 불필요

## 채널 소유 audit (불변식 OK)

| 루프 | 소유 채널 |
|------|----------|
| breathing | chest.inhale |
| head | head.rotate* |
| pose | spine.* |
| **armPose (신규)** | **armL/R.z·x, elbowL/R.z** |
| blink | blink |

- 루프 간 채널 겹침 0
- 제스처(arm.*, elbow.*, chest.lean/turn, head.g*)와 armPose는 **arm/elbow 겹침** → speaking에서만 공존하며 큐 후순위(제스처)가 승, armPose는 speaking=rest로 양보 → 충돌 없음

## 검증된 회전축 (CLAUDE.md)

- UpperArm `z`=프론탈 들기/내리기(차렷 ∓1.3), `x`=앞뒤(**음수=앞**/양수=뒤)
- LowerArm 팔꿈치 `z`=굽힘(좌− / 우+)
- 허리짚기: 상완 살짝 들고(z) 팔꿈치 굽혀(z) 손을 허리로 / 뒷짐: 상완 뒤로(x+) + 팔꿈치 굽힘

## 디버그

- DebugPanel "Idle Poses" 버튼 → `companion:idlepose` 이벤트 → useAnimator가 해당 포즈를 out-hold-return 일회성으로 주입(큐 후순위 승, 1.8s 유지 후 복귀). 축/진폭 수동 검증용
- 값은 초기 추정 → 디버그로 튜닝

## 단계

1. docs (이 문서)
2. `moods.ts`: armPose 루프 + IDLE_ARM_POSES + pose 둘러보기 분기 + BASE_LOOPS 등록
3. `useAnimator.ts`: `companion:idlepose` 수동 트리거 핸들러
4. `DebugPanel.tsx`: Idle Poses 버튼
5. 빌드 + 디버그 튜닝

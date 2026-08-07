// 절차 모션 예산 — 리뉴얼 각 단계의 회귀 그물 (docs/motion-renewal-plan.md)
//
// `npm run motion:stat` 이 이 파일을 돌려 표를 출력한다. 시드 고정이라 수치는 결정적이다.
//
// ⚠️ **예산은 조이기만 한다.** 통과시키려고 완화하는 것은 측정기를 끄는 것과 같다
// ([[dont-weaken-verification]]). "물리적으로 도달 불가능한 기준이었다"는 실측 근거가 있을
// 때만 조정하고, 조정 사실과 근거를 반드시 보고한다.
//
// 남은 조이기:
//   3단계(본 커버리지)   → DRIVEN_BONES 12 이상
//   4단계(연속 신호화)   → WORST_STILL 1.0
//
// ⚠️ WORST_STILL 만 **느슨해진 이력**이 있다 (20 → 23, 1단계). 완화가 아니라 **무효한 기준선의
// 교정**이며 근거는 아래 상수 주석에 실측으로 남겼다. 이런 조정은 사용자 판단을 받고 한다.

import { describe, expect, it } from 'vitest';
import { formatProfile, profileIdle, STILL_THRESHOLD } from './motionProfile';
import { DRIFT, DRIFT_AMP } from './channels';

// ── 예산 (조이기만 할 것) ─────────────────────────────────────
const BURST_TOP5 = 0.35; // 총 회전량 중 상위 5% 프레임 비중 상한 (5단계 후 0.305)
// 구동 본 최대 각속도 상한 deg/s (5단계 후 114.1 — 여유 5%).
// ⚠️ 이 예산이 dt 축소의 천장이다. 최대 속도는 대략 1/dt 로 오르므로 지금보다 dt 를 더 줄이면
// 곧 걸린다. 걸리면 완화가 아니라 '왜 더 빨라야 하는가'를 먼저 답할 것.
const PEAK_SPEED = 120;
const DRIVEN_BONES = 7; // 구동 본 수 하한 (기준선 7 — 3단계에서 늘어난다)

// 구동 본 최장 정지 상한 초 (1단계 후 22.35).
//
// 1단계에서 16.35 → 22.35 로 **나빠 보이게** 움직였지만 실제 퇴행이 아니다. 해당 구간(RLowerArm,
// t=112~135s)의 실체는 `elbowR.z` 가 22초에 걸쳐 0.016→0.041rad = **총 1.44° · 평균 0.213°/s** 로
// 기는 것이다(문턱 0.5°/s의 절반). 수정 전에도 같은 1.44° 를 움직였는데, 리드인 보간 결함이 그걸
// 0.8초로 압축해 만든 **속도 스파이크가 정지 카운터를 리셋**해 16.35 로 보였을 뿐 — 팔은 그때도
// 22초간 시각적으로 멈춰 있었다. 즉 20 이라는 예산은 결함이 만든 착시 위에 세운 무효한 기준선이다.
//
// 진짜 원인은 `armRelaxed`(차렷) 의 목표 범위가 `elbowR.z ∈ [-0.02, 0.08]` 로 인지 문턱 아래라는
// 것 → **2단계에서 진폭을 손봐 수치를 실제로 낮춘다.** 최종 목표는 4단계의 1.0s 로 불변.
//
// 5단계(delay 축소)로 22.35 → 14.58 이 됐다. delay 는 곧 정지 시간이므로 직접 줄어든다.
const WORST_STILL = 16;

describe('절차 모션 프로파일', () => {
  const profile = profileIdle();

  it('프로파일 표 출력 (npm run motion:stat)', () => {
    console.log('\n' + formatProfile(profile) + '\n');
    expect(profile.bones.length).toBeGreaterThan(0);
  });

  it('결정적: 같은 시드는 같은 수치', () => {
    const again = profileIdle();
    expect(again.burstTop5).toBe(profile.burstTop5);
    expect(again.worstStill).toBe(profile.worstStill);
    expect(again.peakSpeed).toBe(profile.peakSpeed);
  });

  it(`버스트 집중도(상위 5%) ≤ ${BURST_TOP5}`, () => {
    expect(profile.burstTop5).toBeLessThanOrEqual(BURST_TOP5);
  });

  it(`최대 각속도 ≤ ${PEAK_SPEED}°/s`, () => {
    expect(profile.peakSpeed).toBeLessThanOrEqual(PEAK_SPEED);
  });

  it(`최장 정지 ≤ ${WORST_STILL}s`, () => {
    expect(profile.worstStill).toBeLessThanOrEqual(WORST_STILL);
  });

  it(`구동 본 ≥ ${DRIVEN_BONES}`, () => {
    expect(profile.drivenBones).toBeGreaterThanOrEqual(DRIVEN_BONES);
  });
});

describe('micro-drift 는 정지를 가리지 못한다 (4단계의 근거)', () => {
  it('drift 최대 각속도가 인지 문턱 미만', () => {
    // sine 의 최대 각속도 = 진폭 × 각주파수. 이게 문턱보다 작으면 hold 구간의 '얼어붙음'을
    // drift 로는 못 가린다 = 4단계(연속 신호화)가 별도로 필요하다는 근거.
    const peak = Math.max(
      ...Object.values(DRIFT).map(
        ([freq, , amp]) => amp * DRIFT_AMP * freq * (180 / Math.PI),
      ),
    );
    expect(peak).toBeLessThan(STILL_THRESHOLD);
  });
});

// 절차 모션 예산 — 리뉴얼 각 단계의 회귀 그물 (docs/motion-renewal-plan.md)
//
// `npm run motion:stat` 이 이 파일을 돌려 표를 출력한다. 시드 고정이라 수치는 결정적이다.
//
// ⚠️ **예산은 조이기만 한다.** 통과시키려고 완화하는 것은 측정기를 끄는 것과 같다
// ([[dont-weaken-verification]]). "물리적으로 도달 불가능한 기준이었다"는 실측 근거가 있을
// 때만 조정하고, 조정 사실과 근거를 반드시 보고한다.
//
// 현재 값은 **리뉴얼 전 기준선**이다 — 좋아서가 아니라 지금이 그렇다는 특성화(characterization).
// 각 단계 완료 시 그 단계의 완료 기준까지 조인다:
//   1단계(리드인 보간 수정) → BURST_TOP5 0.45 · PEAK_SPEED 120
//   3단계(본 커버리지)      → DRIVEN_BONES 12 이상
//   4단계(연속 신호화)      → WORST_STILL 1.0

import { describe, expect, it } from 'vitest';
import { formatProfile, profileIdle, STILL_THRESHOLD } from './motionProfile';
import { DRIFT, DRIFT_AMP } from './channels';

// ── 예산 (조이기만 할 것) ─────────────────────────────────────
const BURST_TOP5 = 0.7; // 총 회전량 중 상위 5% 프레임 비중 상한 (기준선 0.633)
const PEAK_SPEED = 260; // 구동 본 최대 각속도 상한 deg/s (기준선 238)
const WORST_STILL = 20; // 구동 본 최장 정지 상한 초 (기준선 16.35)
const DRIVEN_BONES = 7; // 구동 본 수 하한 (기준선 7 — 3단계에서 늘어난다)

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

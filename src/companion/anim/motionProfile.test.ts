// 절차 모션 예산 — 리뉴얼 각 단계의 회귀 그물 (docs/motion-renewal-plan.md)
//
// `npm run motion:stat` 이 이 파일을 돌려 표를 출력한다. 시드 고정이라 수치는 결정적이다.
//
// ⚠️ **통과시키려고 완화하지 않는다** — 측정기를 끄는 것과 같다([[dont-weaken-verification]]).
// "무효한 기준선이었다"는 실측 근거가 있을 때만 조정하고, 조정 사실과 근거를 반드시 보고한다.
// 반대로 **조이는 것도 의무가 아니다** — 아래 예산 블록의 '가드레일이지 래칫이 아니다' 참조.
//
// 남은 조이기:
//   3단계(본 커버리지)   → DRIVEN_BONES 12 이상
//   4단계(연속 신호화)   → WORST_STILL 1.0
//
// ⚠️ 판정은 **다중 시드 평균**(profileMean)으로 한다. 단일 시드는 난수 소비량이 달라지는 변경에
// 대해 비교 불가다 — 근거는 motionProfile.ts profileMean 주석.

import { describe, expect, it } from 'vitest';
import {
  BUDGET_SEEDS,
  formatProfile,
  profileMean,
  STILL_THRESHOLD,
} from './motionProfile';
import { DRIFT, DRIFT_AMP } from './channels';

const MINUTES = 3; // 시드당 시뮬 길이

// ── 예산 ──────────────────────────────────────────────────────
// 값은 전부 **BUDGET_SEEDS 평균** 기준 (2단계에서 단일 시드 기준을 폐기하고 재기준).
//
// ⚠️ **예산은 가드레일이지 래칫이 아니다.** 매 단계 실측값에 바짝 붙여 조이지 말 것 — 3·4단계는
// 이 수치들을 정당하게 바꾸는 작업이라, 여유 없는 예산은 회귀를 잡는 대신 기능 구현을 막는다.
// 조이는 건 그 단계의 **완료 기준으로 명시된 항목**에 한한다(아래 '남은 조이기').
const BURST_TOP5 = 0.35; // 총 회전량 중 상위 5% 프레임 비중 상한 (2단계 후 0.319)
const DRIVEN_BONES = 7; // 구동 본 수 하한 (3단계에서 늘어난다)

// 구동 본 최대 각속도 상한 deg/s (2단계 후 103.7).
// ⚠️ 이 예산이 dt 축소의 천장이다 — 최대 속도는 대략 1/dt 로 오른다. 5단계 2차 폴리싱에서 dt 를
// 더 줄이면 걸린다. 걸리면 완화가 아니라 '왜 더 빨라야 하는가'를 먼저 답할 것.
const PEAK_SPEED = 120;

// 구동 본 최장 정지 상한 초 (2단계 후 11.20). 최종 목표는 4단계의 1.0s.
//
// ⚠️ **한 번 느슨해진 이력이 있다** (1단계, 20 → 23). 완화가 아니라 무효한 기준선의 교정이었다:
// 20 은 리드인 보간 결함이 만든 속도 스파이크가 정지 카운터를 리셋한 착시 위에 세운 값이었고,
// 실제로는 그때도 `elbowR.z` 가 22초에 걸쳐 총 1.44°(평균 0.213°/s, 문턱의 절반)만 기고 있었다.
// 이후 5단계(delay 축소)로 23 → 16 으로 되돌렸다.
const WORST_STILL = 16;

describe('절차 모션 프로파일', () => {
  const profile = profileMean(BUDGET_SEEDS, { minutes: MINUTES });

  it(`프로파일 표 출력 — 시드 ${BUDGET_SEEDS.length}개 × ${MINUTES}분 평균 (npm run motion:stat)`, () => {
    console.log('\n' + formatProfile(profile) + '\n');
    expect(profile.bones.length).toBeGreaterThan(0);
  });

  it('결정적: 같은 시드 집합은 같은 수치', () => {
    const again = profileMean(BUDGET_SEEDS, { minutes: MINUTES });
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

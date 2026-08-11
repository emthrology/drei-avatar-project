// 절차 모션 예산 — 절차 애니메이션 변경의 회귀 그물
//
// `npm run motion:stat` 이 이 파일을 돌려 표를 출력한다. 시드 고정이라 수치는 결정적이다.
//
// ⚠️ **통과시키려고 완화하지 않는다** — 측정기를 끄는 것과 같다([[dont-weaken-verification]]).
// "무효한 기준선이었다"는 실측 근거가 있을 때만 조정하고, 조정 사실과 근거를 반드시 보고한다.
// 반대로 **조이는 것도 의무가 아니다** — 아래 예산 블록의 '가드레일이지 래칫이 아니다' 참조.
//
// 남은 조이기: 없음. (4단계의 목표치 WORST_STILL 1.0 도 **달성 후에도 예산은 그대로 둔다** —
// 실측값은 아래 표 출력과 계획서에 남기고, 예산은 회귀를 잡을 만큼만 느슨하게 유지한다.)
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
import { DERIVE_OFF, DRIFT, driftAt, driftPeakSpeed } from './channels';

const MINUTES = 3; // 시드당 시뮬 길이

// ── 예산 ──────────────────────────────────────────────────────
// 값은 전부 **BUDGET_SEEDS 평균** 기준 (2단계에서 단일 시드 기준을 폐기하고 재기준).
//
// ⚠️ **예산은 가드레일이지 래칫이 아니다.** 매 단계 실측값에 바짝 붙여 조이지 말 것 — 3·4단계는
// 이 수치들을 정당하게 바꾸는 작업이라, 여유 없는 예산은 회귀를 잡는 대신 기능 구현을 막는다.
// 조이는 건 그 단계의 **완료 기준으로 명시된 항목**에 한한다(아래 '남은 조이기').
const BURST_TOP5 = 0.35; // 총 회전량 중 상위 5% 프레임 비중 상한 (3단계 후 0.316)

// 구동 본 수 하한. 3단계 실측은 11 이지만(파생 본 Neck·UpperChest·양 Shoulder 추가) **예산은
// 안 조인다** — 가드레일이지 래칫이 아니다. 여기를 11 로 박으면 이후 단계가 파생 계수를
// 정당하게 조정할 때(예: 어깨 몫을 줄여 한 본이 문턱 아래로 내려갈 때) 회귀가 아닌 일로
// 예산과 싸우게 된다. 계획서의 목표 12 는 미달인데, 상반신에 남은 본이 손목뿐이라
// 3단계 범위의 천장이 11 이다(손목은 idle 미사용 + 손인사 프로브 경로, Hips/다리는 범위 밖).
const DRIVEN_BONES = 7;

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
//
// ⚠️ 3단계부터 이 지표는 **이전 단계와 직접 비교하면 안 된다** — 측정 대상 본이 9 → 13 으로
// 늘었고(파생 본), 분배 때문에 본별 진폭도 의도적으로 줄었다(같은 총 회전을 여러 관절이 나눔).
// 새 본은 원 본의 정지 패턴을 물려받으므로 최장 정지가 늘어나는 게 정상이다(3단계 후 13.30).
// 정지 자체를 없애는 건 4단계(연속 신호화)의 일이다.
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

// 파생 계수 0 = 파생 없음. **구조**만 단정한다 — 수치를 박으면 이후 단계가 루프/드리프트를
// 정당하게 바꿀 때 회귀가 아닌데도 여기서 걸린다(예산과 같은 이유). 계수 0 일 때 원 경로가
// 산술적으로 동일하다는 건 channels.test.ts 가 단위로 고정한다.
describe('본 파생 off = 기존 경로 (비퇴행)', () => {
  const off = profileMean(BUDGET_SEEDS, {
    minutes: MINUTES,
    derive: DERIVE_OFF,
  });

  it('파생 본이 프로파일에 아예 안 나타난다', () => {
    const names = off.bones.map((b) => b.bone);
    expect(names).not.toContain('Neck');
    expect(names).not.toContain('UpperChest');
    expect(names).not.toContain('LShoulder');
    expect(names).not.toContain('RShoulder');
  });
});

// ⚠️ **이 단정문은 4단계에서 의식적으로 뒤집었다.** 원래는 "drift 최대 각속도 < 인지 문턱"
// 이었고, 그게 4단계(연속 신호화)가 별도로 필요하다는 근거였다(0단계가 일부러 박아둔 장치).
// 4단계가 바로 그 문턱을 넘기는 작업이므로, 이제는 **넘겼는지**를 단정한다.
// 완화가 아니라 설계 의도의 반전이다 — 그 순간을 자각하라고 만든 테스트가 제 역할을 했다.
describe('자세 동요가 정지를 실제로 가린다 (4단계)', () => {
  it('본 축마다 최대 각속도가 인지 문턱 이상', () => {
    for (const key of Object.keys(DRIFT)) {
      expect(driftPeakSpeed(key)).toBeGreaterThanOrEqual(STILL_THRESHOLD);
    }
  });

  it('sine 하나로는 부족하다 — 축마다 2성분 이상이어야 한다', () => {
    // 단일 sine 은 반주기마다 속도가 0을 지나 정지 구간이 남는다. 성분이 2개 이상이고
    // 주파수가 서로 다를 때만 속도 0 지점이 어긋나 합이 문턱 위에 머문다.
    for (const [key, comps] of Object.entries(DRIFT)) {
      expect(comps.length, key).toBeGreaterThanOrEqual(2);
      const freqs = new Set(comps.map(([f]) => f));
      expect(freqs.size, key).toBe(comps.length);
    }
  });

  it('대상 밖 본은 조용히 0 (손목·얼굴)', () => {
    // 손목은 상완 동요가 FK 로 전달되고, 얼굴은 표정 이벤트와 동기돼야 한다
    expect(driftAt('handL.z', 3.3)).toBe(0);
    expect(driftAt('blink', 3.3)).toBe(0);
  });
});

// probe.ts 순수 로직 테스트.
//
// 핵심 의도: docs/wave-gesture-attempts.md 의 **실패 5건을 합성 샘플로 재현**해서, 프로브가
// 각 실패 모드를 실제로 잡아내는지 고정한다. 프로브 자체가 틀리면 이후 모든 판정이 무의미하므로
// "측정기를 먼저 검증"하는 셈. (testing-strategy: 구현이 아닌 불변식을 테스트)

import { describe, it, expect } from 'vitest';
import {
  measureArm,
  evaluateArm,
  WAVE_TARGETS,
  countClaps,
  measureClap,
  evaluateClap,
  type ArmSample,
  type ClapSample,
} from './probe';

const IDENT: ArmSample['armQuat'] = [0, 0, 0, 1];

/** 합성 샘플 생성기 — hand 궤적만 주면 나머지는 고정 자세로 채운다 */
function mk(
  hands: [number, number, number][],
  opts: {
    shoulder?: [number, number, number];
    elbow?: [number, number, number];
    quats?: ArmSample['armQuat'][];
  } = {},
): ArmSample[] {
  const shoulder = opts.shoulder ?? [0.15, 1.35, 0];
  // 팔꿈치는 어깨 아래, 손은 팔꿈치보다 앞(z+)에 오도록 기본값 배치
  const elbow = opts.elbow ?? [0.2, 1.15, 0.02];
  return hands.map((hand, i) => ({
    t: i * 0.05,
    shoulder,
    elbow,
    hand,
    armQuat: opts.quats?.[i] ?? IDENT,
  }));
}

/** Z축 회전 쿼터니언 (상완이 흔들리는 상황 합성용) */
function quatZ(rad: number): ArmSample['armQuat'] {
  return [0, 0, Math.sin(rad / 2), Math.cos(rad / 2)];
}

describe('measureArm', () => {
  it('빈 샘플은 0으로 떨어진다 (크래시 없음)', () => {
    const m = measureArm([]);
    expect(m.swingAxis).toBe('none');
    expect(m.armSwing).toBe(0);
    expect(m.clearance).toBe(0);
  });

  it('좌우 흔들기를 horizontal 로 판정', () => {
    const m = measureArm(
      mk([
        [0.1, 1.4, 0.2],
        [0.25, 1.4, 0.2],
        [0.1, 1.4, 0.2],
        [0.25, 1.4, 0.2],
      ]),
    );
    expect(m.swingAxis).toBe('horizontal');
    expect(m.span.x).toBeCloseTo(0.15, 5);
  });

  it('주축이 확실치 않으면(등방 이동) none — 오탐 방지', () => {
    // x·y 이동폭이 비슷하면 "좌우로 흔든다"고 말할 수 없다
    const m = measureArm(
      mk([
        [0.1, 1.35, 0.2],
        [0.2, 1.45, 0.2],
      ]),
    );
    expect(m.swingAxis).toBe('none');
  });

  it('상완 각변화는 샘플 수(프레임률)에 비례하지 않는다', () => {
    // 같은 ±0.1rad 진동을 성기게/촘촘히 샘플링 → armSwing 동일해야 비교 가능
    const coarse = measureArm(
      mk(
        [
          [0, 1.4, 0.2],
          [0, 1.4, 0.2],
          [0, 1.4, 0.2],
        ],
        {
          quats: [quatZ(-0.1), quatZ(0), quatZ(0.1)],
        },
      ),
    );
    const fine = measureArm(
      mk(Array(9).fill([0, 1.4, 0.2]), {
        quats: [-0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075, 0.1].map(
          quatZ,
        ),
      }),
    );
    expect(fine.armSwing).toBeCloseTo(coarse.armSwing, 6);
  });

  it('clearance 는 손과 상완 선분(어깨→팔꿈치)의 최소거리', () => {
    // 손을 어깨-팔꿈치 선분 위에 정확히 올리면 0
    const m = measureArm(
      mk([[0, 1.0, 0]], { shoulder: [0, 1.2, 0], elbow: [0, 0.8, 0] }),
    );
    expect(m.clearance).toBeCloseTo(0, 6);
  });
});

describe('evaluateArm — 실패 기록 재현 (docs/wave-gesture-attempts.md)', () => {
  /** 다섯 실패를 전부 피한 "이상적인" 손인사 궤적 */
  const good = mk(
    [
      [0.28, 1.46, 0.22],
      [0.4, 1.46, 0.22],
      [0.28, 1.46, 0.22],
      [0.4, 1.46, 0.22],
    ],
    { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
  );

  it('기준을 만족하면 pass', () => {
    const v = evaluateArm(good);
    expect(v.pass).toBe(true);
    expect(v.checks.every((c) => c.pass)).toBe(true);
  });

  it('시도1 "위아래 flap" → 흔들림 주축 불합격', () => {
    const v = evaluateArm(
      mk(
        [
          [0.3, 1.36, 0.22],
          [0.3, 1.52, 0.22],
          [0.3, 1.36, 0.22],
        ],
        { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
      ),
    );
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '흔들림 주축')?.pass).toBe(false);
  });

  it('시도2·3 "팔 전체 덜렁덜렁" → 상완 정지도 불합격', () => {
    const v = evaluateArm(
      mk(
        [
          [0.28, 1.46, 0.22],
          [0.4, 1.46, 0.22],
          [0.28, 1.46, 0.22],
        ],
        {
          shoulder: [0.16, 1.36, 0],
          elbow: [0.22, 1.16, 0.04],
          quats: [quatZ(-0.5), quatZ(0), quatZ(0.5)], // 상완이 크게 스윙
        },
      ),
    );
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '상완 정지도')?.pass).toBe(false);
  });

  it('시도4 "하완이 상완과 겹침" → 상완 이격 불합격', () => {
    // 손이 어깨-팔꿈치 선분에 바짝 붙음
    const v = evaluateArm(
      mk(
        [
          [0.17, 1.3, 0.005],
          [0.19, 1.28, 0.005],
          [0.17, 1.3, 0.005],
        ],
        { shoulder: [0.16, 1.36, 0], elbow: [0.2, 1.16, 0.01] },
      ),
    );
    expect(v.checks.find((c) => c.name === '상완 이격')?.pass).toBe(false);
  });

  it('시도5 "팔꿈치가 뒤로 접힘" → 하완 전방 불합격', () => {
    // hand.z 가 elbow.z 보다 뒤(작음)
    const v = evaluateArm(
      mk(
        [
          [0.28, 1.46, -0.1],
          [0.4, 1.46, -0.1],
          [0.28, 1.46, -0.1],
        ],
        { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
      ),
    );
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '하완 전방')?.pass).toBe(false);
  });

  it('거의 안 움직이면 이동폭 불합격 (정적 자세를 인사로 오인 방지)', () => {
    const v = evaluateArm(
      mk(
        [
          [0.3, 1.46, 0.22],
          [0.302, 1.46, 0.22],
        ],
        { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
      ),
    );
    expect(v.checks.find((c) => c.name === '이동폭')?.pass).toBe(false);
  });

  it('손목은 제자리여도 손끝이 흔들리면 통과 — 손목 주도 인사(측정 지점 이동)', () => {
    // 손목 회전은 Hand 관절 원점을 못 움직인다(자식인 손가락만 움직임). 손목 기준으로 재던
    // 옛 프로브는 이 동작을 이동폭 0 으로 봐서 **어떤 손인사도 통과 불가**였다.
    const wristStill: [number, number, number] = [0.28, 1.46, 0.22];
    const samples = mk([wristStill, wristStill, wristStill, wristStill], {
      shoulder: [0.16, 1.36, 0],
      elbow: [0.22, 1.16, 0.04],
    }).map((s, i) => ({
      ...s,
      // 손끝만 좌우로 12cm 스윙
      tip: [i % 2 === 0 ? 0.24 : 0.36, 1.52, 0.24] as [number, number, number],
    }));

    const v = evaluateArm(samples);
    expect(v.checks.find((c) => c.name === '흔들림 주축')?.pass).toBe(true);
    expect(v.checks.find((c) => c.name === '이동폭')?.pass).toBe(true);
    expect(v.pass).toBe(true);
    // 손목 자체는 안 움직였다는 사실도 함께 고정 (측정 지점이 정말 손끝인지)
    expect(v.span.x).toBeCloseTo(0, 6);
  });

  it('tip 이 없는 모델은 hand 로 대체 — 기존 판정과 동일 (비퇴행)', () => {
    const noTip = mk(
      [
        [0.28, 1.46, 0.22],
        [0.4, 1.46, 0.22],
        [0.28, 1.46, 0.22],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    );
    expect(noTip[0].tip).toBeUndefined();
    expect(evaluateArm(noTip).pass).toBe(true);
  });

  it('targets 를 덮어쓰면 같은 샘플도 판정이 바뀐다 (임계 재보정 경로)', () => {
    const flap = mk(
      [
        [0.3, 1.36, 0.22],
        [0.3, 1.52, 0.22],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    );
    expect(
      evaluateArm(flap).checks.find((c) => c.name === '흔들림 주축')?.pass,
    ).toBe(false);
    expect(
      evaluateArm(flap, { ...WAVE_TARGETS, swingAxis: 'vertical' }).checks.find(
        (c) => c.name === '흔들림 주축',
      )?.pass,
    ).toBe(true);
  });
});

// ── 양손 동작(박수) ────────────────────────────────────────────────────────
//
// 여기서 고정하는 불변식은 "박수와 **박수가 아닌 것**을 가른다"이다. 특히 VRMA_07 처럼
// **손이 만나긴 하는데 손바닥이 비스듬한** 케이스를 통과시키면 측정기가 무의미해진다
// (실측: 진짜 박수 정렬 0.87~1.00 vs VRMA_07 접촉 0.14~0.43).
//
// 나머지 두 실패 모드는 **리타게팅 때문에 생긴다** — 회전만 옮겨지고 손 위치는 체형을 타므로
// 한 캐릭터에서 맞은 손이 다른 캐릭터에선 겹치거나(관통) 안 닿는다(허공 박수).

/** 합성 박수 샘플 — 간격을 코사인으로 흔들고 손바닥 정렬은 상수로 준다 */
function mkClap(
  opts: {
    claps?: number;
    min?: number;
    max?: number;
    align?: number;
    midY?: number;
    cross?: boolean;
  } = {},
): ClapSample[] {
  const {
    claps = 5,
    min = 0.03,
    max = 0.16,
    align = 0.95,
    midY = 0.23,
    cross = false,
  } = opts;
  const perClap = 10;
  const out: ClapSample[] = [];
  for (let i = 0; i < claps * perClap; i++) {
    // **벌어진 위상에서 시작**한다 — 접촉에서 시작하면 첫 프레임과 첫 주기 끝의 접촉이
    // 별개 episode 로 세어져 횟수가 1 더 나온다(경계 효과).
    const phase = ((i % perClap) / perClap + 0.5) % 1;
    const gap = min + (max - min) * (1 - Math.cos(2 * Math.PI * phase)) * 0.5;
    out.push({
      t: i * 0.03,
      // 판정은 손바닥 중심 거리로 한다 — 손목 거리는 참고치라 같은 값을 넣어 둔다
      palmGap: gap,
      gap,
      midY,
      midZ: 0.18,
      // 좌우 손은 미러라 법선 부호가 같은 쪽으로 잡힌다 — 판정은 절댓값으로 한다
      alignL: -align,
      alignR: -align,
      // 좌우 간격은 접촉에서 최소 — 교차 케이스는 음수까지 내려간다
      sepX: cross ? gap - min - 0.02 : gap,
    });
  }
  return out;
}

describe('countClaps', () => {
  it('히스테리시스로 접촉 근방의 떨림을 한 번으로 센다', () => {
    // 접촉선(0.12)을 오르내리며 떨리지만 release(0.15)를 안 넘으면 계속 같은 1회
    const jitter = [0.2, 0.11, 0.13, 0.119, 0.14, 0.118, 0.2, 0.1, 0.2];
    expect(countClaps(jitter, 0.12, 0.15)).toBe(2);
  });

  it('벌어지지 않고 붙어만 있으면 1회', () => {
    expect(countClaps([0.2, 0.05, 0.05, 0.05, 0.05], 0.12, 0.15)).toBe(1);
  });

  it('한 번도 안 붙으면 0회', () => {
    expect(countClaps([0.3, 0.25, 0.22, 0.3], 0.12, 0.15)).toBe(0);
  });
});

describe('evaluateClap', () => {
  it('제대로 된 박수는 통과한다', () => {
    const v = evaluateClap(mkClap());
    expect(v.pass).toBe(true);
    expect(v.claps).toBe(5);
  });

  it('손은 만나지만 손바닥이 비스듬하면 떨어뜨린다 (VRMA_07 실패 모드)', () => {
    const v = evaluateClap(mkClap({ align: 0.3 }));
    expect(v.checks.find((c) => c.name === '손바닥 정렬')?.pass).toBe(false);
    expect(v.pass).toBe(false);
    // 접촉 자체는 성립한다 — 정렬만 골라서 떨어뜨렸는지 확인(지표 분리 검증)
    expect(v.checks.find((c) => c.name === '접촉')?.pass).toBe(true);
  });

  it('손바닥이 손 두께보다 가까우면 떨어뜨린다 (리타게팅 관통)', () => {
    const v = evaluateClap(mkClap({ min: 0.005 }));
    expect(v.checks.find((c) => c.name === '비관통')?.pass).toBe(false);
  });

  it('접촉 판정은 손목이 아니라 **손바닥 중심** 거리로 한다', () => {
    // 손목은 손바닥 안쪽에 있어 맞닿으면 거의 일치한다 → 손목 거리로 재면 허공 박수를
    // 통과시킨다(실측 반증: 손목 +0.081 인데 육안은 "갖다 대지도 않음").
    const airClap = mkClap({ min: 0.09 }).map((s) => ({ ...s, gap: 0.01 }));
    expect(evaluateClap(airClap).checks.find((c) => c.name === '접촉')?.pass).toBe(
      false,
    );
  });

  it('손바닥 정렬은 붙은 프레임을 빼고 접근 구간에서만 잰다', () => {
    // 접촉 근방에서 축이 퇴화해 값이 뒤집혀도(실측 male1) 판정이 흔들리면 안 된다
    const s = mkClap();
    const polluted = s.map((x) =>
      x.gap < 0.08 ? { ...x, alignL: 0.02, alignR: -0.03 } : x,
    );
    expect(evaluateClap(polluted).align).toBeCloseTo(evaluateClap(s).align, 6);
  });

  it('손이 안 닿으면 떨어뜨린다 (리타게팅 허공 박수)', () => {
    const v = evaluateClap(mkClap({ min: 0.12, max: 0.3 }));
    expect(v.checks.find((c) => c.name === '접촉')?.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '박수 횟수')?.pass).toBe(false);
  });

  it('붙어만 있고 치지 않으면 떨어뜨린다', () => {
    expect(
      evaluateClap(mkClap({ min: 0.02, max: 0.05 })).checks.find(
        (c) => c.name === '벌림폭',
      )?.pass,
    ).toBe(false);
  });

  it('손이 얼굴을 가릴 높이면 떨어뜨린다 (올린 박수를 트림으로 뺀 이유)', () => {
    expect(
      evaluateClap(mkClap({ midY: 0.7 })).checks.find(
        (c) => c.name === '손 높이',
      )?.pass,
    ).toBe(false);
  });

  it('빈 샘플은 0으로 떨어진다 (크래시 없음)', () => {
    expect(measureClap([])).toEqual({
      minPalmGap: 0,
      maxPalmGap: 0,
      minGap: 0,
      maxGap: 0,
      claps: 0,
      minSep: 0,
      align: 0,
      handY: 0,
      handZ: 0,
    });
  });
});

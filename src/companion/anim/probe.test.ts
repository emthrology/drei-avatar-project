// probe.ts 순수 로직 테스트.
//
// 핵심 의도: docs/wave-gesture-attempts.md 의 **실패 5건을 합성 샘플로 재현**해서, 프로브가
// 각 실패 모드를 실제로 잡아내는지 고정한다. 프로브 자체가 틀리면 이후 모든 판정이 무의미하므로
// "측정기를 먼저 검증"하는 셈. (testing-strategy: 구현이 아닌 불변식을 테스트)

import { describe, it, expect } from 'vitest';
import { measureArm, evaluateArm, WAVE_TARGETS, type ArmSample } from './probe';

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
    const m = measureArm(mk([
      [0.10, 1.40, 0.20],
      [0.25, 1.40, 0.20],
      [0.10, 1.40, 0.20],
      [0.25, 1.40, 0.20],
    ]));
    expect(m.swingAxis).toBe('horizontal');
    expect(m.span.x).toBeCloseTo(0.15, 5);
  });

  it('주축이 확실치 않으면(등방 이동) none — 오탐 방지', () => {
    // x·y 이동폭이 비슷하면 "좌우로 흔든다"고 말할 수 없다
    const m = measureArm(mk([
      [0.10, 1.35, 0.20],
      [0.20, 1.45, 0.20],
    ]));
    expect(m.swingAxis).toBe('none');
  });

  it('상완 각변화는 샘플 수(프레임률)에 비례하지 않는다', () => {
    // 같은 ±0.1rad 진동을 성기게/촘촘히 샘플링 → armSwing 동일해야 비교 가능
    const coarse = measureArm(mk([[0, 1.4, 0.2], [0, 1.4, 0.2], [0, 1.4, 0.2]], {
      quats: [quatZ(-0.1), quatZ(0), quatZ(0.1)],
    }));
    const fine = measureArm(mk(Array(9).fill([0, 1.4, 0.2]), {
      quats: [-0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075, 0.1].map(quatZ),
    }));
    expect(fine.armSwing).toBeCloseTo(coarse.armSwing, 6);
  });

  it('clearance 는 손과 상완 선분(어깨→팔꿈치)의 최소거리', () => {
    // 손을 어깨-팔꿈치 선분 위에 정확히 올리면 0
    const m = measureArm(mk([[0, 1.0, 0]], { shoulder: [0, 1.2, 0], elbow: [0, 0.8, 0] }));
    expect(m.clearance).toBeCloseTo(0, 6);
  });
});

describe('evaluateArm — 실패 기록 재현 (docs/wave-gesture-attempts.md)', () => {
  /** 다섯 실패를 전부 피한 "이상적인" 손인사 궤적 */
  const good = mk(
    [
      [0.28, 1.46, 0.22],
      [0.40, 1.46, 0.22],
      [0.28, 1.46, 0.22],
      [0.40, 1.46, 0.22],
    ],
    { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
  );

  it('기준을 만족하면 pass', () => {
    const v = evaluateArm(good);
    expect(v.pass).toBe(true);
    expect(v.checks.every((c) => c.pass)).toBe(true);
  });

  it('시도1 "위아래 flap" → 흔들림 주축 불합격', () => {
    const v = evaluateArm(mk(
      [
        [0.30, 1.36, 0.22],
        [0.30, 1.52, 0.22],
        [0.30, 1.36, 0.22],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    ));
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '흔들림 주축')?.pass).toBe(false);
  });

  it('시도2·3 "팔 전체 덜렁덜렁" → 상완 정지도 불합격', () => {
    const v = evaluateArm(mk(
      [
        [0.28, 1.46, 0.22],
        [0.40, 1.46, 0.22],
        [0.28, 1.46, 0.22],
      ],
      {
        shoulder: [0.16, 1.36, 0],
        elbow: [0.22, 1.16, 0.04],
        quats: [quatZ(-0.5), quatZ(0), quatZ(0.5)], // 상완이 크게 스윙
      },
    ));
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '상완 정지도')?.pass).toBe(false);
  });

  it('시도4 "하완이 상완과 겹침" → 상완 이격 불합격', () => {
    // 손이 어깨-팔꿈치 선분에 바짝 붙음
    const v = evaluateArm(mk(
      [
        [0.17, 1.30, 0.005],
        [0.19, 1.28, 0.005],
        [0.17, 1.30, 0.005],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.20, 1.16, 0.01] },
    ));
    expect(v.checks.find((c) => c.name === '상완 이격')?.pass).toBe(false);
  });

  it('시도5 "팔꿈치가 뒤로 접힘" → 하완 전방 불합격', () => {
    // hand.z 가 elbow.z 보다 뒤(작음)
    const v = evaluateArm(mk(
      [
        [0.28, 1.46, -0.10],
        [0.40, 1.46, -0.10],
        [0.28, 1.46, -0.10],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    ));
    expect(v.pass).toBe(false);
    expect(v.checks.find((c) => c.name === '하완 전방')?.pass).toBe(false);
  });

  it('거의 안 움직이면 이동폭 불합격 (정적 자세를 인사로 오인 방지)', () => {
    const v = evaluateArm(mk(
      [
        [0.30, 1.46, 0.22],
        [0.302, 1.46, 0.22],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    ));
    expect(v.checks.find((c) => c.name === '이동폭')?.pass).toBe(false);
  });

  it('targets 를 덮어쓰면 같은 샘플도 판정이 바뀐다 (임계 재보정 경로)', () => {
    const flap = mk(
      [
        [0.30, 1.36, 0.22],
        [0.30, 1.52, 0.22],
      ],
      { shoulder: [0.16, 1.36, 0], elbow: [0.22, 1.16, 0.04] },
    );
    expect(evaluateArm(flap).checks.find((c) => c.name === '흔들림 주축')?.pass).toBe(false);
    expect(
      evaluateArm(flap, { ...WAVE_TARGETS, swingAxis: 'vertical' }).checks.find(
        (c) => c.name === '흔들림 주축',
      )?.pass,
    ).toBe(true);
  });
});

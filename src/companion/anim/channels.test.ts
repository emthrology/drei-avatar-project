// 채널 → 본 오일러 변환 (boneEulers) — 순수 로직이라 VRM 없이 단위 테스트한다.
//
// 지키는 불변식은 둘:
//   ① 계수 0 = 파생 없음 (기존 출력 그대로, 새 본 키조차 안 생김)  → 비퇴행
//   ② 총 회전량 유지 (새 본이 가져간 몫만큼 원 본에서 뺀다)        → 실루엣 불변

import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  boneEulers,
  CHEST_INHALE_SCALE,
  DERIVE_DEFAULT,
  DERIVE_OFF,
  driftAt,
} from './channels';

// drift 는 t=0 에서도 위상 때문에 0 이 아니다 → 값을 상수로 박지 않고 driftAt 로 비교한다
// (표를 정당하게 바꿔도 여기서 안 걸리게).
const at = (state: Record<string, number>, cfg = DERIVE_OFF, t = 0) =>
  boneEulers(state, cfg, t);

describe('boneEulers — 파생 off (비퇴행)', () => {
  it('파생 본 키가 아예 없다', () => {
    const o = at({});
    expect(o.neck).toBeUndefined();
    expect(o.upperChest).toBeUndefined();
    expect(o.shoulderL).toBeUndefined();
    expect(o.shoulderR).toBeUndefined();
  });

  it('머리 = idle 미동 + 제스처 델타 합성', () => {
    const o = at({ 'head.rotateX': 0.1, 'head.gx': 0.02, 'head.rotateY': 0.3 });
    expect(o.head[0]).toBeCloseTo(0.12, 12);
    expect(o.head[1]).toBeCloseTo(0.3, 12);
  });

  it('가슴 x = 호흡 스케일 + 제스처 린 + drift', () => {
    const o = at({ 'chest.inhale': 1, 'chest.leanX': 0.05 }, DERIVE_OFF, 1.5);
    expect(o.chest[0]).toBeCloseTo(
      CHEST_INHALE_SCALE + 0.05 + driftAt('chest.leanX', 1.5),
      12,
    );
  });

  it('팔은 baseline(차렷 ±1.3)을 그대로 쓴다 (drift 오차 내)', () => {
    const o = at({});
    expect(o.armL[2]).toBeCloseTo(
      BASELINE['armL.z'] + driftAt('armL.z', 0),
      12,
    );
    expect(o.armR[2]).toBeCloseTo(
      BASELINE['armR.z'] + driftAt('armR.z', 0),
      12,
    );
  });
});

describe('boneEulers — 파생 on (총 회전량 유지)', () => {
  const cfg = DERIVE_DEFAULT;

  it('목: head 총 회전이 Head + Neck 으로 나뉜다 (합=원래 값)', () => {
    const o = at({ 'head.rotateX': 0.2, 'head.gx': 0.1 }, cfg);
    expect(o.head[0] + o.neck[0]).toBeCloseTo(0.3, 12);
    expect(o.neck[0] / 0.3).toBeCloseTo(cfg.neck, 12);
  });

  it('UpperChest: spine 회전이 Spine + UpperChest 로 나뉜다', () => {
    const o = at({ 'spine.x': 0.4 }, cfg);
    expect(o.spine[0] + o.upperChest[0]).toBeCloseTo(0.4, 12);
    expect(o.upperChest[0] / 0.4).toBeCloseTo(cfg.upperChest, 12);
  });

  it('어깨: 상완의 **baseline 대비 편차**만 나눈다 (차렷 자세에선 어깨 0)', () => {
    const rest = at({}, cfg);
    // 차렷 자세(편차 0)에서 어깨에 남는 건 drift 뿐이다
    expect(rest.shoulderL[2]).toBeCloseTo(
      driftAt('shoulderL.z', 0) + driftAt('armL.z', 0) * cfg.shoulder,
      12,
    );

    const raised = at({ 'armL.z': BASELINE['armL.z'] + 0.6 }, cfg);
    const dz = raised.shoulderL[2] - rest.shoulderL[2];
    const arm = raised.armL[2] - rest.armL[2];
    expect(dz + arm).toBeCloseTo(0.6, 12); // 총량 유지
    expect(dz / 0.6).toBeCloseTo(cfg.shoulder, 12);
  });

  it('파생 본이 없는 모델용: 계수만 0 이면 원 본이 전량을 진다', () => {
    const noNeck = at({ 'head.rotateY': 0.5 }, { ...cfg, neck: 0 });
    expect(noNeck.head[1]).toBeCloseTo(0.5, 12);
    expect(noNeck.neck).toBeUndefined();
  });
});

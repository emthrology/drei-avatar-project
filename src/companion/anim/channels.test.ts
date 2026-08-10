// 채널 → 본 오일러 변환 (boneEulers) — 순수 로직이라 VRM 없이 단위 테스트한다.
//
// 지키는 불변식은 둘:
//   ① 계수 0 = 파생 없음 (기존 출력 그대로, 새 본 키조차 안 생김)  → 비퇴행
//   ② 총 회전량 유지 (새 본이 가져간 몫만큼 원 본에서 뺀다)        → 실루엣 불변
//
// ⚠️ 자세 동요(drift)는 t=0 에서도 위상 때문에 0 이 아니고, 표는 앞으로도 바뀐다.
// 그래서 값을 상수로 박지 않고 **같은 t 의 rest 상태 대비 델타**로 비교한다 — 동요분이 상쇄돼
// 파생 로직만 검증되고, 동요 표를 정당하게 바꿔도 여기서 안 걸린다.

import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  boneEulers,
  CHEST_INHALE_SCALE,
  DERIVE_DEFAULT,
  DERIVE_OFF,
  driftAt,
} from './channels';

const T = 1.5; // 임의 시각 — 동요가 0 이 아닌 지점에서 재는 게 의미 있다
const at = (state: Record<string, number>, cfg = DERIVE_OFF) =>
  boneEulers(state, cfg, T);

/** 같은 t 의 rest 대비 축 델타 (동요분 상쇄) */
const delta = (
  state: Record<string, number>,
  cfg: typeof DERIVE_OFF,
  bone: string,
  axis: 0 | 1 | 2,
) => at(state, cfg)[bone][axis] - at({}, cfg)[bone][axis];

describe('boneEulers — 파생 off (비퇴행)', () => {
  it('파생 본 키가 아예 없다', () => {
    const o = at({});
    expect(o.neck).toBeUndefined();
    expect(o.upperChest).toBeUndefined();
    expect(o.shoulderL).toBeUndefined();
    expect(o.shoulderR).toBeUndefined();
  });

  it('머리 = idle 미동 + 제스처 델타 합성', () => {
    const s = { 'head.rotateX': 0.1, 'head.gx': 0.02, 'head.rotateY': 0.3 };
    expect(delta(s, DERIVE_OFF, 'head', 0)).toBeCloseTo(0.12, 12);
    expect(delta(s, DERIVE_OFF, 'head', 1)).toBeCloseTo(0.3, 12);
  });

  it('가슴 x = 호흡 스케일 + 제스처 린 + 자세 동요', () => {
    // 여기서만 동요를 명시적으로 확인한다 — 본 축 키(chest.x)로 더해지는지
    const o = at({ 'chest.inhale': 1, 'chest.leanX': 0.05 });
    expect(o.chest[0]).toBeCloseTo(
      CHEST_INHALE_SCALE + 0.05 + driftAt('chest.x', T),
      12,
    );
  });

  it('팔은 baseline(차렷 ±1.3)을 그대로 쓴다', () => {
    const o = at({});
    expect(o.armL[2]).toBeCloseTo(
      BASELINE['armL.z'] + driftAt('armL.z', T),
      12,
    );
    expect(o.armR[2]).toBeCloseTo(
      BASELINE['armR.z'] + driftAt('armR.z', T),
      12,
    );
  });
});

describe('boneEulers — 파생 on (총 회전량 유지)', () => {
  const cfg = DERIVE_DEFAULT;

  it('목: head 총 회전이 Head + Neck 으로 나뉜다 (합=원래 값)', () => {
    const s = { 'head.rotateX': 0.2, 'head.gx': 0.1 };
    const head = delta(s, cfg, 'head', 0);
    const neck = delta(s, cfg, 'neck', 0);
    expect(head + neck).toBeCloseTo(0.3, 12);
    expect(neck / 0.3).toBeCloseTo(cfg.neck, 12);
  });

  it('UpperChest: spine 회전이 Spine + UpperChest 로 나뉜다', () => {
    const s = { 'spine.x': 0.4 };
    const spine = delta(s, cfg, 'spine', 0);
    const upper = delta(s, cfg, 'upperChest', 0);
    expect(spine + upper).toBeCloseTo(0.4, 12);
    expect(upper / 0.4).toBeCloseTo(cfg.upperChest, 12);
  });

  it('어깨: 상완의 **baseline 대비 편차**만 나눈다 (차렷 자세에선 어깨 0)', () => {
    // 팔을 내린 정적 자세에서 어깨가 딸려 올라가면 안 된다 → baseline 은 상완이 계속 진다
    expect(at({}, cfg).armL[2]).toBeCloseTo(
      BASELINE['armL.z'] + driftAt('armL.z', T),
      12,
    );

    const s = { 'armL.z': BASELINE['armL.z'] + 0.6 };
    const shoulder = delta(s, cfg, 'shoulderL', 2);
    const arm = delta(s, cfg, 'armL', 2);
    expect(shoulder + arm).toBeCloseTo(0.6, 12); // 총량 유지
    expect(shoulder / 0.6).toBeCloseTo(cfg.shoulder, 12);
  });

  it('파생 본이 없는 모델용: 계수만 0 이면 원 본이 전량을 진다', () => {
    const noNeck = { ...cfg, neck: 0 };
    expect(delta({ 'head.rotateY': 0.5 }, noNeck, 'head', 1)).toBeCloseTo(
      0.5,
      12,
    );
    expect(at({}, noNeck).neck).toBeUndefined();
  });

  it('자세 동요는 본마다 독립이다 (상완 동요가 어깨로 안 샌다)', () => {
    // 파생이 끝난 뒤 본 단위로 더하므로, 어깨에는 어깨 자신의 신호만 있어야 한다.
    // 채널 단계에서 더하면 분배 계수만큼 쪼개져 두 본이 같은 파형을 공유하게 된다.
    expect(at({}, cfg).shoulderL[2]).toBeCloseTo(driftAt('shoulderL.z', T), 12);
  });
});

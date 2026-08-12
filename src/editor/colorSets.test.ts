import { describe, it, expect } from 'vitest';
import {
  COLOR_SETS,
  COLOR_SET_AXES,
  NO_COLOR_SETS,
  getColorSet,
  ownedLabels,
  swatchOf,
  tintFor,
  type ColorSetSelection,
} from './colorSets';
import { PART_LABELS, labelForMaterialName } from './meshLabels';

describe('색상 세트 — 미선택은 완전 no-op (개발 원칙①)', () => {
  it('세트를 안 고르면 어떤 부위도 틴트를 안 받는다', () => {
    for (const label of Object.values(PART_LABELS))
      expect(tintFor(label, NO_COLOR_SETS)).toBeNull();
    expect(ownedLabels(NO_COLOR_SETS).size).toBe(0);
  });

  it('없는 id 는 조용히 미적용 (카탈로그가 바뀌어 저장된 id 가 사라져도 안 깨진다)', () => {
    const sel: ColorSetSelection = { hair: 'nope', eye: 'nope' };
    expect(tintFor(PART_LABELS.hair, sel)).toBeNull();
    expect(ownedLabels(sel).size).toBe(0);
  });

  it('라벨이 없는 머티리얼(비VRoid 등)은 틴트 대상이 아니다', () => {
    expect(tintFor(null, { hair: 'hair-ash', eye: null })).toBeNull();
  });
});

describe('색상 세트 — 소유 부위에만 걸린다', () => {
  const hairOnly: ColorSetSelection = { hair: 'hair-ash', eye: null };
  const eyeOnly: ColorSetSelection = { hair: null, eye: 'eye-blue' };

  it('헤어 세트는 머리·뒷머리·눈썹 3부위를 소유한다', () => {
    expect(ownedLabels(hairOnly)).toEqual(
      new Set([PART_LABELS.hair, PART_LABELS.hairBack, PART_LABELS.brow]),
    );
  });

  it('헤어 세트는 눈·피부·의류를 안 건드린다', () => {
    for (const label of [
      PART_LABELS.eyeIris,
      PART_LABELS.eyeHighlight,
      PART_LABELS.skinFace,
      PART_LABELS.skinBody,
      PART_LABELS.tops,
      PART_LABELS.eyelash, // 속눈썹은 의도적으로 제외 — 눈썹만 포함
    ])
      expect(tintFor(label, hairOnly)).toBeNull();
  });

  it('눈동자 세트는 홍채와 하이라이트를 함께 소유한다 (한쪽만 칠하면 톤이 겉돈다)', () => {
    expect(ownedLabels(eyeOnly)).toEqual(
      new Set([PART_LABELS.eyeIris, PART_LABELS.eyeHighlight]),
    );
    expect(tintFor(PART_LABELS.eyeIris, eyeOnly)).not.toBeNull();
    expect(tintFor(PART_LABELS.eyeHighlight, eyeOnly)).not.toBeNull();
    expect(tintFor(PART_LABELS.eyeWhite, eyeOnly)).toBeNull();
  });

  it('두 축을 동시에 골라도 서로 간섭하지 않는다', () => {
    const both: ColorSetSelection = { hair: 'hair-black', eye: 'eye-amber' };
    expect(tintFor(PART_LABELS.hair, both)).toEqual(
      tintFor(PART_LABELS.hair, { hair: 'hair-black', eye: null }),
    );
    expect(tintFor(PART_LABELS.eyeIris, both)).toEqual(
      tintFor(PART_LABELS.eyeIris, { hair: null, eye: 'eye-amber' }),
    );
    expect(ownedLabels(both).size).toBe(5);
  });

  it('헤어 세트의 머리·뒷머리는 같은 배색이다 (앞뒤가 어긋나면 안 된다)', () => {
    for (const set of COLOR_SETS.hair) {
      const sel: ColorSetSelection = { hair: set.id, eye: null };
      expect(tintFor(PART_LABELS.hair, sel)).toEqual(
        tintFor(PART_LABELS.hairBack, sel),
      );
    }
  });
});

describe('색상 세트 — 카탈로그 무결성', () => {
  const HEX = /^#[0-9a-f]{6}$/;

  it('모든 세트가 유효한 hex 배색을 갖는다', () => {
    for (const axis of COLOR_SET_AXES)
      for (const set of COLOR_SETS[axis])
        for (const [label, tint] of Object.entries(set.parts)) {
          expect(Object.values(PART_LABELS)).toContain(label);
          expect(tint.lit, `${set.id}/${label} lit`).toMatch(HEX);
          expect(tint.shade, `${set.id}/${label} shade`).toMatch(HEX);
        }
  });

  it('shade 가 lit 보다 어둡다 — 툰 음영이 반대로 서면 입체가 뒤집힌다', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (
        0.2126 * ((n >> 16) & 255) +
        0.7152 * ((n >> 8) & 255) +
        0.0722 * (n & 255)
      );
    };
    for (const axis of COLOR_SET_AXES)
      for (const set of COLOR_SETS[axis])
        for (const [label, tint] of Object.entries(set.parts))
          expect(
            lum(tint.shade),
            `${set.id}/${label}: shade 가 lit 보다 밝다`,
          ).toBeLessThan(lum(tint.lit));
  });

  it('세트 id 는 축 안에서 고유하다 (선택 키)', () => {
    for (const axis of COLOR_SET_AXES) {
      const ids = COLOR_SETS[axis].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('getColorSet 은 축을 섞지 않는다', () => {
    expect(getColorSet('hair', 'eye-blue')).toBeNull();
    expect(getColorSet('eye', 'hair-ash')).toBeNull();
    expect(getColorSet('hair', null)).toBeNull();
  });

  it('swatchOf 는 세트의 첫 부위 배색을 준다', () => {
    for (const axis of COLOR_SET_AXES)
      for (const set of COLOR_SETS[axis])
        expect(swatchOf(set)).toEqual(Object.values(set.parts)[0]);
  });
});

// 세트와 에셋이 만나는 유일한 접점이 머티리얼 이름 매칭이다 — 여기가 어긋나면 세트가
// 조용히 아무것도 안 칠한다. 실제 파일에서 뜬 이름으로 고정한다(male_base·female_base·
// Hair_sample·male1/Hair_2·female1/Hair_1 등에서 확인한 VRoid 명명).
describe('실측 머티리얼 이름 → 세트 소유 부위', () => {
  const CASES: [string, string][] = [
    ['N00_000_00_HairBack_00_HAIR (Instance)', PART_LABELS.hairBack],
    ['N00_000_Hair_00_HAIR (Instance)', PART_LABELS.hair],
    ['N00_000_00_FaceBrow_00_FACE (Instance)', PART_LABELS.brow],
    ['N00_000_00_EyeIris_00_EYE (Instance)', PART_LABELS.eyeIris],
    ['N00_000_00_EyeHighlight_00_EYE (Instance)', PART_LABELS.eyeHighlight],
  ];

  it.each(CASES)('%s → %s', (matName, label) => {
    expect(labelForMaterialName(matName)).toBe(label);
  });

  it('두 세트를 다 켜면 위 5부위가 정확히 전부 칠해진다', () => {
    const sel: ColorSetSelection = { hair: 'hair-brown', eye: 'eye-green' };
    for (const [matName] of CASES)
      expect(tintFor(labelForMaterialName(matName), sel)).not.toBeNull();
  });

  it('흰자·눈매·피부는 안 칠해진다 (세트 밖 부위가 딸려오면 얼굴이 물든다)', () => {
    const sel: ColorSetSelection = { hair: 'hair-brown', eye: 'eye-green' };
    for (const matName of [
      'N00_000_00_EyeWhite_00_EYE (Instance)',
      'N00_000_00_FaceEyeline_00_FACE (Instance)',
      'N00_000_00_Face_00_SKIN (Instance)',
      'N00_000_00_Body_00_SKIN (Instance)',
    ])
      expect(tintFor(labelForMaterialName(matName), sel)).toBeNull();
  });
});

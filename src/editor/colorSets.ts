import { PART_LABELS, type PartLabel } from './meshLabels';

// ─── 색상 세트 (헤어 / 눈동자) ────────────────────────────────────────────────
//
// 세트 = **부위 여러 개에 배색 한 쌍씩을 한 번에** 거는 카탈로그 항목이다. 한 부위만 칠하면
// 안 되는 게 실측으로 확인됐다 — 홍채만 칠하면 눈 하이라이트(흰 반사광)가 원래 색으로 남아
// 톤이 겉돌고, 앞머리(`Hair`)만 칠하면 뒷머리(`HairBack`)와 어긋난다.
//
// ⚠️ **lit/shade 는 절대색이 아니라 텍스처에 곱해지는 틴트다.** 관련 머티리얼의 authored 값이
// 전부 `#ffffff` + `baseColorTexture` 라서(male_base·female_base·Hair_sample·Hair_1·Face_2·
// Face_3 전수 확인), 실제 색은 텍스처에 있고 lit/shade 는 곱수로만 작동한다. 귀결:
//   · **어둡게는 가되 밝게는 못 간다** — 갈색 머리 → 검정/애쉬는 되지만 어두운 텍스처 →
//     밝은 금발은 안 나온다. 밝은 쪽까지 필요하면 그건 틴트가 아니라 **텍스처 스왑**이고
//     별도 축이다(partLoader.loadFacePart 주석의 "실제 변형 카탈로그는 baseColorTexture 교체").
//   · authored 가 전부 중립이라 **'원본' = 세트 미선택**으로 정확히 복원된다(개발 원칙①).
//
// ⚠️ **부위는 파츠마다 있기도 없기도 하다** — 세트는 그 순간 씬에 있는 부위에만 걸리고 나머지는
// 조용히 건너뛴다(라벨 매칭이라 자동). 실측:
//   · 남자1 **헤어 1**(`Hair_sample`)은 `HairBack` 하나뿐 → '머리' 없이 '뒷머리'만 칠해진다.
//     에디터 기본 선택이라 **기본 상태에서 바로 걸리는 경로**다. 헤어 2·3 과 여자1 전 헤어는 둘 다 있음
//   · 속눈썹(`FaceEyelash`)은 male_base 에만 있고 female_base 엔 없다. 눈썹(`FaceBrow`)은 양쪽 다 있음
//   · 베이스 VRM 자체엔 헤어 머티리얼이 **없다** → 헤어 슬롯이 '원본'이면 머리 부위가 0개
//
// 📌 헤어 세트가 **눈썹**을 함께 칠한다 — 눈썹은 헤어 파츠가 아니라 얼굴/베이스 소유 메시지만,
// 머리색을 바꾸면 눈썹이 따라가는 게 자연스럽다. 라벨 기반이라 소유 파츠와 무관하게 걸린다.
// (속눈썹은 일부러 뺐다. 넣으려면 아래 `hairSet` 에 한 줄이다.)

export type ColorSetAxis = 'hair' | 'eye';

/** 한 부위의 배색 — MToon 의 `color`(밝은 면) / `shadeColorFactor`(그림자 면) */
export interface PartTint {
  lit: string;
  shade: string;
}

export interface ColorSet {
  id: string; // 축 내에서 고유(선택 키)
  label: string;
  /** 이 세트가 **소유**하는 부위 → 배색. 여기 없는 부위는 세트가 안 건드린다 */
  parts: Partial<Record<PartLabel, PartTint>>;
}

/** 축별 선택된 세트 id (null = 원본 = 미적용) */
export type ColorSetSelection = Record<ColorSetAxis, string | null>;

/** 미선택 상태 — 이 값이면 세트 레이어는 완전 no-op(기존 출력과 동일) */
export const NO_COLOR_SETS: ColorSetSelection = { hair: null, eye: null };

// 헤어: 머리·뒷머리·눈썹이 같은 틴트를 공유한다(따로 줄 이유가 아직 없다 — 필요해지면
// parts 를 직접 적으면 된다. 구조는 이미 부위별 배색이라 바꿀 게 없음).
const hairSet = (
  id: string,
  label: string,
  lit: string,
  shade: string,
): ColorSet => ({
  id,
  label,
  parts: {
    [PART_LABELS.hair]: { lit, shade },
    [PART_LABELS.hairBack]: { lit, shade },
    [PART_LABELS.brow]: { lit, shade },
  },
});

// 눈동자: 홍채와 하이라이트를 함께. 하이라이트는 **거의 흰색**으로 둔다 — 반사광이라
// 진하게 틴트하면 '빛나는 점'이 아니라 '색 얼룩'으로 읽힌다.
const eyeSet = (
  id: string,
  label: string,
  iris: PartTint,
  highlight: PartTint,
): ColorSet => ({
  id,
  label,
  parts: {
    [PART_LABELS.eyeIris]: iris,
    [PART_LABELS.eyeHighlight]: highlight,
  },
});

export const COLOR_SETS: Record<ColorSetAxis, ColorSet[]> = {
  hair: [
    hairSet('hair-ash', '애쉬', '#c3c7cf', '#7c828e'),
    hairSet('hair-brown', '브라운', '#8a6247', '#4e3527'),
    hairSet('hair-black', '블랙', '#55555f', '#2b2b33'),
    hairSet('hair-burgundy', '버건디', '#9c4757', '#58232f'),
    hairSet('hair-pink', '핑크', '#e3a3b4', '#a86577'),
  ],
  eye: [
    eyeSet(
      'eye-blue',
      '블루',
      { lit: '#6f9fe0', shade: '#3f6bab' },
      { lit: '#eaf2ff', shade: '#c4d6f2' },
    ),
    eyeSet(
      'eye-green',
      '그린',
      { lit: '#74b177', shade: '#3d7a48' },
      { lit: '#e9f6ea', shade: '#c3dcc6' },
    ),
    eyeSet(
      'eye-amber',
      '앰버',
      { lit: '#cf9047', shade: '#8a5528' },
      { lit: '#fff0dc', shade: '#e2c9a6' },
    ),
    eyeSet(
      'eye-violet',
      '바이올렛',
      { lit: '#9a7fd0', shade: '#5d4a92' },
      { lit: '#f0eaff', shade: '#cbbde8' },
    ),
  ],
};

export const COLOR_SET_AXES: ColorSetAxis[] = ['hair', 'eye'];

/** UI 대표색 — 세트를 한 칸으로 보여줄 때 쓸 배색(첫 부위 기준) */
export function swatchOf(set: ColorSet): PartTint {
  const first = Object.values(set.parts)[0];
  return first ?? { lit: '#ffffff', shade: '#ffffff' };
}

export function getColorSet(
  axis: ColorSetAxis,
  id: string | null,
): ColorSet | null {
  if (!id) return null;
  return COLOR_SETS[axis].find((s) => s.id === id) ?? null;
}

/**
 * 부위 라벨 → 적용할 배색. 선택된 세트가 그 부위를 소유하지 않으면 null(= 세트 미개입).
 *
 * **미선택이면 전 부위 null** 이라 세트 레이어 전체가 no-op 이 된다 — appearance 가 기존
 * meshInfos 경로를 그대로 타므로 출력이 바이트 동일하다(개발 원칙① 비퇴행).
 */
export function tintFor(
  label: PartLabel | null,
  sel: ColorSetSelection,
): PartTint | null {
  if (!label) return null;
  for (const axis of COLOR_SET_AXES) {
    const tint = getColorSet(axis, sel[axis])?.parts[label];
    if (tint) return tint;
  }
  return null;
}

/**
 * 지금 세트가 소유한 부위 라벨 집합 — 에디터 메시 리스트가 "이 행은 세트가 정한다"를
 * 표시하는 데 쓴다. 소유 중인 부위를 메시별 색으로 편집하면 세트에 덮여 무효가 되므로,
 * 조용히 안 먹는 대신 **UI 가 먼저 말해준다**.
 */
export function ownedLabels(sel: ColorSetSelection): Set<PartLabel> {
  const owned = new Set<PartLabel>();
  for (const axis of COLOR_SET_AXES) {
    const set = getColorSet(axis, sel[axis]);
    if (!set) continue;
    for (const label of Object.keys(set.parts) as PartLabel[]) owned.add(label);
  }
  return owned;
}

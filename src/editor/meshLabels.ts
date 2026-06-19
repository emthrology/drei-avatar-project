// ─── 메시 → 부위 라벨 규칙 (단일 선언, base·파츠·성별 공통) ─────────────────────
// 에디터 파츠/색상 리스트는 씬의 모든 Mesh 를 나열하는데, 메시 이름은 두 출처가 섞여
// 사용자 친화적이지 않다:
//   · 베이스 = VRoid 원시 명 `Face (merged)` / `Body (merged)`
//   · 멀티-프리미티브 얼굴 = three.js GLTFLoader 가 프리미티브당 Mesh 로 펼치며
//     `createUniqueName` 이 `Face_3`, `Face_3_1` … `Face_3_6` 으로 자동 suffix
// → 메시 이름으로는 부위를 알 수 없다.
//
// **규칙**: 표시 라벨은 메시 이름이 아니라 **머티리얼 이름**에서 뽑는다. VRoid 는 머티리얼을
// 단일 규칙 `N00_<num>_<num>_<Part>_<num>_<TYPE> (Instance)` 으로 찍어내고, `<Part>`/`<TYPE>`
// 토큰이 베이스·얼굴 변형·바디·헤어·의류·**양 성별** 무관하게 동일하다(9개 파일 실측 검증).
// 따라서 이 테이블 한 장이 base 불가지 공통 규칙이 된다 — 새 에셋도 VRoid 명명을 따르면 자동 편입.
//
// **불변식(신규 에셋/부위 추가 시 준수)**:
//   1) 매칭 키는 머티리얼 이름(메시 이름 아님). 새 부위는 아래 LABEL_RULES 에 1줄 추가.
//   2) 구체적인 토큰이 먼저 와야 한다(EyeIris 가 Face 보다, HairBack 이 Hair 보다 위).
//   3) 미매칭은 **원본 메시 이름으로 fallback**(개발 원칙①=비퇴행: 비VRoid·예외 머티리얼도 안 깨짐).
//   4) 매칭/색 적용 키는 여전히 메시 `name` — label 은 표시 전용(append-only 필드).

// 위에서부터 첫 매칭 채택 → **구체적인 부위를 앞에**.
const LABEL_RULES: { test: RegExp; label: string }[] = [
  // 눈 (EYE 타입) — Iris/Highlight/White 는 Face* 보다 구체적이라 먼저
  { test: /EyeIris/i,      label: '눈동자' },
  { test: /EyeHighlight/i, label: '눈 하이라이트' },
  { test: /EyeWhite/i,     label: '흰자' },
  // 얼굴 부속 (FACE 타입) — FaceMouth/Brow/Eyeline/Eyelash. 피부(_Face_NN_SKIN)보다 먼저
  { test: /FaceEyelash/i,  label: '속눈썹' },
  { test: /FaceEyeline/i,  label: '눈매' },
  { test: /FaceBrow/i,     label: '눈썹' },
  { test: /FaceMouth/i,    label: '입' },
  // 피부 — 얼굴 피부(_Face_NN_SKIN: Face 뒤에 숫자)와 몸 피부(_Body_)
  { test: /_Face_\d/i,     label: '피부(얼굴)' },
  { test: /_Body_/i,       label: '피부(몸)' },
  // 헤어 — HairBack(뒷머리)을 Hair(앞/전체)보다 먼저
  { test: /HairBack/i,     label: '뒷머리' },
  { test: /Hair/i,         label: '머리' },
  // 의류
  { test: /Tops/i,         label: '상의' },
  { test: /Bottoms/i,      label: '하의' },
  { test: /Shoes/i,        label: '신발' },
]

// 머티리얼 이름 → 부위 라벨. 미매칭이면 null(소비처가 원본 메시 이름으로 fallback).
export function labelForMaterialName(matName: string | undefined | null): string | null {
  if (!matName) return null
  for (const r of LABEL_RULES) if (r.test.test(matName)) return r.label
  return null
}

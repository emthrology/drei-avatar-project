// ─── 컨벤션 락 (male_base.vrm 실측, 2026-06-16) ──────────────────────────
// 이 값들은 베이스 파일에서 실측한 "고정 규약"이다. 모든 authored 파츠는 이 규약에
// 순응해야 런타임 조립이 성립한다. 베이스 교체 시 이 파일과 ASSET_SPEC.md 동기화.
// female1 도 동일 규약 검증 완료(54본·57모프·A-pose·MToon) → 한 규약으로 다중 베이스 호스팅.
export const BASE_SPEC = {
  vrmVersion: '1.0',          // VRMC_vrm specVersion
  boneNaming: 'VRoid J_Bip_*', // VRM humanoid 54본
  humanoidBones: 54,
  bindPose: 'A-pose',         // VRoid 표준
  heightMeters: 1.756,
  scale: 1.0,
  material: 'MToon',
  // Face (merged): 표정/비세메 모프 57종 (Fcl_*) — 조형(shape) 모프는 없음(Blender 별도)
  expressionPresets: 14,
} as const

// 파츠 식별 프리픽스 (메시/노드 네이밍 규칙)
export const PART_PREFIX = {
  hair: 'Hair_',
  tops: 'Tops_',
  bottoms: 'Bottoms_',
  shoes: 'Shoes_',
} as const

// ─── 모듈 파츠 카탈로그 (라이브러리) ──────────────────────────────────────────
// 카테고리마다 변형(variant) N개를 들고, 런타임은 '카테고리 슬롯당 1개 active' 로
// 선택·교체(swap-on-select)한다. VRoid식 피커가 이 카탈로그를 탭/그리드로 그린다.
//   kind: 'static' = loadPart(GLB, 정적 스킨드) / 'spring' = loadSpringPart(VRM, VRMC_springBone)
//        'face'   = loadFacePart(VRM, Face 메시 교체 + 눈 본 graft + 표정 모프 미러)
//   변형 추가 = 소스 드롭 → scripts/extractParts.mjs JOBS 1줄 → 아래 variants 1줄 → npm run assets
export type PartStatus = 'idle' | 'loading' | 'loaded' | 'missing' | 'error'
export type PartKind = 'static' | 'spring' | 'face'
export type PartCategory = 'face' | 'hair' | 'tops' | 'bottoms'

export interface PartVariant {
  id: string    // 전역 고유(썸네일 파일명·선택 키로도 쓰임)
  // 표시 라벨 — **`[명칭][숫자]` 형식으로 통일**(여자1 기준): 얼굴/헤어/상의/하의 + 1부터 순번.
  //   카테고리당 배열 순서대로 번호 매김(예: 상의 1, 상의 2 …). 서술형 명칭(화이트 셔츠 등) 금지.
  //   id·url·파일명은 별개(영문 식별자 유지) — 라벨만 이 규칙을 따른다. 신규 variant 추가 시 준수.
  label: string
  url: string
  thumb: string // '/avatars/thumbs/<id>.png' (scripts/renderThumbs.mjs 산출)
}

export interface PartCategoryDef {
  id: PartCategory
  label: string       // 탭 라벨
  kind: PartKind      // 로더 선택
  allowNone: boolean  // '원본/없음' 선택 허용
  variants: PartVariant[]
}

const thumb = (id: string) => `/avatars/thumbs/${id}.png`

// ─── 캐릭터(베이스) 축 ────────────────────────────────────────────────────────
// 공유 엔진 1개가 base-종속 silo 라이브러리 N개를 호스팅한다(에셋은 base 종속, 기계는 일반).
// 캐릭터 = { baseUrl, catalog }. base 를 바꾸면 그 base 의 카탈로그로 통째 스왑된다.
// variant id 는 전역 고유(썸네일 파일명·선택 키) → female 은 'f1-' 프리픽스로 male 과 분리.
export type CharacterId = 'male1' | 'female1'

export interface CharacterDef {
  id: CharacterId
  label: string
  baseUrl: string
  catalog: PartCategoryDef[]
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'male1', label: '남자1', baseUrl: '/avatars/male_base.vrm',
    catalog: [
      {
        id: 'face', label: 'Face', kind: 'face', allowNone: true,
        variants: [
          { id: 'face-eyesample', label: '얼굴 1', url: '/avatars/male1/Face_eyesample.vrm', thumb: thumb('face-eyesample') },
          { id: 'face-2',         label: '얼굴 2',  url: '/avatars/male1/Face_2.vrm',         thumb: thumb('face-2') },
        ],
      },
      {
        id: 'hair', label: 'Hair', kind: 'spring', allowNone: true,
        variants: [
          { id: 'hair-sample', label: '헤어 1',   url: '/avatars/Hair_sample.vrm',     thumb: thumb('hair-sample') },
          { id: 'hair-2',      label: '헤어 2',    url: '/avatars/male1/Hair_2.vrm',    thumb: thumb('hair-2') },
          { id: 'hair-3',      label: '헤어 3',    url: '/avatars/male1/Hair_3.vrm',    thumb: thumb('hair-3') },
        ],
      },
      {
        id: 'tops', label: 'Tops', kind: 'static', allowNone: true,
        variants: [
          { id: 'tops-white-shirt', label: '상의 1', url: '/avatars/male1/Tops_white_shirt.glb', thumb: thumb('tops-white-shirt') },
          { id: 'tops-basic',       label: '상의 2', url: '/avatars/male1/Tops_basic.glb',       thumb: thumb('tops-basic') },
          { id: 'tops-hawaian',     label: '상의 3', url: '/avatars/male1/Tops_hawaian.glb',     thumb: thumb('tops-hawaian') },
          { id: 'tops-2',           label: '상의 4', url: '/avatars/male1/Tops_2.glb',           thumb: thumb('tops-2') },
          { id: 'tops-3',           label: '상의 5', url: '/avatars/male1/Tops_3.glb',           thumb: thumb('tops-3') },
        ],
      },
      {
        id: 'bottoms', label: 'Bottoms', kind: 'static', allowNone: true,
        variants: [
          { id: 'bottoms-scotch-pants', label: '하의 1', url: '/avatars/male1/Bottoms_scotch_pants.glb', thumb: thumb('bottoms-scotch-pants') },
          { id: 'bottoms-jean',         label: '하의 2', url: '/avatars/male1/Bottoms_jean.glb',         thumb: thumb('bottoms-jean') },
          { id: 'bottoms-white-pants',  label: '하의 3', url: '/avatars/male1/Bottoms_white_pants.glb',  thumb: thumb('bottoms-white-pants') },
        ],
      },
    ],
  },
  {
    id: 'female1', label: '여자1', baseUrl: '/avatars/female1/female_base.vrm',
    catalog: [
      {
        id: 'face', label: 'Face', kind: 'face', allowNone: true,
        variants: [
          { id: 'f1-face-2', label: '얼굴 2', url: '/avatars/female1/Face_2.vrm', thumb: thumb('f1-face-2') },
          { id: 'f1-face-3', label: '얼굴 3', url: '/avatars/female1/Face_3.vrm', thumb: thumb('f1-face-3') },
          { id: 'f1-face-4', label: '얼굴 4', url: '/avatars/female1/Face_4.vrm', thumb: thumb('f1-face-4') },
        ],
      },
      {
        // female 헤어 = 앞머리(Hair001) + 뒷머리(HairBack) 2메시 결합 추출(extractParts meshes[]),
        //   런타임 loadSpringPart 가 멀티-메시 처리. 스프링 물리 보존(kind:'spring').
        id: 'hair', label: 'Hair', kind: 'spring', allowNone: true,
        variants: [
          { id: 'f1-hair-1', label: '헤어 1', url: '/avatars/female1/Hair_1.vrm', thumb: thumb('f1-hair-1') },
          { id: 'f1-hair-2', label: '헤어 2', url: '/avatars/female1/Hair_2.vrm', thumb: thumb('f1-hair-2') },
          { id: 'f1-hair-3', label: '헤어 3', url: '/avatars/female1/Hair_3.vrm', thumb: thumb('f1-hair-3') },
          { id: 'f1-hair-4', label: '헤어 4', url: '/avatars/female1/Hair_4.vrm', thumb: thumb('f1-hair-4') },
        ],
      },
      {
        id: 'tops', label: 'Tops', kind: 'static', allowNone: true,
        variants: [
          { id: 'f1-tops-1', label: '상의 1', url: '/avatars/female1/Tops_1.glb', thumb: thumb('f1-tops-1') },
          { id: 'f1-tops-2', label: '상의 2', url: '/avatars/female1/Tops_2.glb', thumb: thumb('f1-tops-2') },
          // TODO 시각 검토: top_3 = 타이 제외본 / top_4 = Onepiece·Shoes 혼합본(Tops_01_CLOTH만 남김)
          { id: 'f1-tops-3', label: '상의 3', url: '/avatars/female1/Tops_3.glb', thumb: thumb('f1-tops-3') },
          { id: 'f1-tops-4', label: '상의 4', url: '/avatars/female1/Tops_4.glb', thumb: thumb('f1-tops-4') },
        ],
      },
      {
        id: 'bottoms', label: 'Bottoms', kind: 'static', allowNone: true,
        variants: [
          { id: 'f1-bottoms-1', label: '하의 1', url: '/avatars/female1/Bottoms_1.glb', thumb: thumb('f1-bottoms-1') },
          { id: 'f1-bottoms-2', label: '하의 2', url: '/avatars/female1/Bottoms_2.glb', thumb: thumb('f1-bottoms-2') },
          { id: 'f1-bottoms-3', label: '하의 3', url: '/avatars/female1/Bottoms_3.glb', thumb: thumb('f1-bottoms-3') },
        ],
      },
    ],
  },
]

export const getCharacter = (id: CharacterId): CharacterDef =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]

// ─── 카탈로그 파생 인덱스 ──────────────────────────────────────────────────────
export interface ResolvedVariant { categoryId: PartCategory; kind: PartKind; variant: PartVariant }

// 전 캐릭터 union — variant id 가 전역 고유라 안전. 변형 해석(조립·썸네일)은 캐릭터 무관.
export const VARIANTS_BY_ID: Map<string, ResolvedVariant> = new Map(
  CHARACTERS.flatMap((ch) =>
    ch.catalog.flatMap((c) => c.variants.map((variant) => [variant.id, { categoryId: c.id, kind: c.kind, variant }] as const)),
  ),
)

export type Selection = Record<PartCategory, string | null>

// 기본 선택: 주어진 카탈로그의 각 카테고리 첫 변형 active ('풀 장착' 거동 보존). 없으면 null.
// 카탈로그에 없는 카테고리 키는 부재(female 은 hair 없음) → 소비처는 active catalog 만 순회할 것.
export const defaultSelection = (catalog: PartCategoryDef[]): Selection =>
  Object.fromEntries(catalog.map((c) => [c.id, c.variants[0]?.id ?? null])) as Selection

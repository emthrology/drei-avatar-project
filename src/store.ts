import { create } from 'zustand'
import * as THREE from 'three'
import {
  CharacterId, Selection, PartStatus, PartCategory,
  getCharacter, defaultSelection,
} from './editor/constants'

export interface MeshInfo {
  name: string        // 씬 메시 이름 — 매칭/색 적용 키(고유). React key 로도 사용
  label: string       // 표시 전용 부위 라벨(editor/meshLabels 규칙). 미매칭 시 name 으로 채움
  visible: boolean
  litColor: string    // hex
  shadeColor: string  // hex
}

// 에디터 씬 조명 (전부 숫자 — Three.js 객체 아님이라 store 안전. Lights가 선언적 반영)
export interface Lighting {
  ambient: number      // 0~1 환경광 강도 (낮출수록 그늘 깊어짐 → toony 경계 드러남)
  keyIntensity: number // 0~3 메인광 강도
  keyAngle: number     // 0~360° 메인광 Y축 방위각 (옆으로 돌리면 한쪽 그늘 → rim/toony 가시)
}

// 현재 하드코딩 값과 동일 (position [0.5,2,2] ≈ 방위각 14°, 수평반경 2.06, 높이 2)
export const LIGHTING_DEFAULTS: Lighting = { ambient: 0.6, keyIntensity: 2.0, keyAngle: 14 }

// MToon 셰이더 파라미터. 모드 전환 시 ShaderPanel이 언마운트돼도 유지되도록 store에 보관
// (rim 계열은 핵심 아님 + 작은 오버레이에서 인지 불가라 제거 — docs/shader-features-plan.md)
export interface ShaderParams {
  outlineWidth: number        // 0~0.02 외곽선 두께
  shadingToonyFactor: number  // 0~1 툰 경계 선명도
}

export const SHADER_DEFAULTS: ShaderParams = {
  outlineWidth: 0.001,
  shadingToonyFactor: 0.9,
}

// 컬러 그레이딩 (포스트프로세싱) — 사진편집 톤 변경. 모델을 안 건드리는 화면 레이어라
// 머티리얼 기능과 비충돌. 디폴트는 전부 무변화값 → 로드 시 기존 화면 동일 (비퇴행)
export interface GradingParams {
  brightness: number  // -1~1 (0=무변화)
  contrast: number    // -1~1 (0=무변화)
  hue: number         // -π~π 라디안 (0=무변화)
  saturation: number  // -1~1 (0=무변화)
}

export const GRADING_DEFAULTS: GradingParams = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
}

// ─── 에디터 조립 슬라이스 (composer 엔진) ──────────────────────────────────────
// 캐릭터(base) 축 + 슬롯 선택(swap-on-select) + 파츠 로드 상태 + 눈색(텍스처 축).
// Three.js 객체는 절대 넣지 않음(엔진은 module singleton/ref 로 씬 보유) — 여긴 선택 데이터만.
const idleStatus = (characterId: CharacterId): Record<string, PartStatus> =>
  Object.fromEntries(getCharacter(characterId).catalog.map((c) => [c.id, 'idle']))

interface AvatarState {
  avatarUrl: string  // 컴패니언 디폴트 base 로만 잔류(에디터는 미사용)
  setAvatarUrl: (url: string) => void

  // 에디터 조립 슬라이스
  characterId: CharacterId
  selection: Selection
  eyeColor: string | null
  partStatus: Record<string, PartStatus>
  setCharacter: (id: CharacterId) => void  // base 전환 → 선택/상태/눈색 리셋
  setSelection: (cat: PartCategory, variantId: string | null) => void
  setEyeColor: (hex: string | null) => void
  setPartStatus: (id: string, status: PartStatus) => void

  meshInfos: MeshInfo[]
  setMeshInfos: (infos: MeshInfo[]) => void
  setMeshVisible: (name: string, visible: boolean) => void
  setMeshLitColor: (name: string, color: string) => void
  setMeshShadeColor: (name: string, color: string) => void

  lighting: Lighting
  setLighting: (patch: Partial<Lighting>) => void

  shader: ShaderParams
  setShader: (patch: Partial<ShaderParams>) => void

  grading: GradingParams
  setGrading: (patch: Partial<GradingParams>) => void
}

export const useAvatarStore = create<AvatarState>((set) => ({
  avatarUrl: '/avatars/male_sample.vrm',
  setAvatarUrl: (url) => set({ avatarUrl: url, meshInfos: [] }),

  characterId: 'male1',
  selection: defaultSelection(getCharacter('male1').catalog),
  eyeColor: null,
  partStatus: idleStatus('male1'),
  // base 전환: 선택·상태·눈색을 새 캐릭터 기준으로 리셋(이전 base 파츠 키 잔류 방지).
  // meshInfos 도 비움 → 새 base 로드 후 ComposerAvatar 가 재수집.
  setCharacter: (id) =>
    set((s) =>
      id === s.characterId
        ? s
        : {
            characterId: id,
            selection: defaultSelection(getCharacter(id).catalog),
            partStatus: idleStatus(id),
            eyeColor: null,
            meshInfos: [],
          },
    ),
  setSelection: (cat, variantId) =>
    set((s) => ({ selection: { ...s.selection, [cat]: variantId } })),
  setEyeColor: (hex) => set({ eyeColor: hex }),
  setPartStatus: (id, status) =>
    set((s) => ({ partStatus: { ...s.partStatus, [id]: status } })),

  lighting: LIGHTING_DEFAULTS,
  setLighting: (patch) => set((s) => ({ lighting: { ...s.lighting, ...patch } })),

  shader: SHADER_DEFAULTS,
  setShader: (patch) => set((s) => ({ shader: { ...s.shader, ...patch } })),

  grading: GRADING_DEFAULTS,
  setGrading: (patch) => set((s) => ({ grading: { ...s.grading, ...patch } })),

  meshInfos: [],
  setMeshInfos: (infos) => set({ meshInfos: infos }),

  setMeshVisible: (name, visible) =>
    set((s) => ({
      meshInfos: s.meshInfos.map((m) => (m.name === name ? { ...m, visible } : m)),
    })),

  setMeshLitColor: (name, color) =>
    set((s) => ({
      meshInfos: s.meshInfos.map((m) => (m.name === name ? { ...m, litColor: color } : m)),
    })),

  setMeshShadeColor: (name, color) =>
    set((s) => ({
      meshInfos: s.meshInfos.map((m) => (m.name === name ? { ...m, shadeColor: color } : m)),
    })),
}))

// THREE.Color ↔ hex 변환 헬퍼
export function threeColorToHex(c: THREE.Color): string {
  return '#' + c.getHexString()
}

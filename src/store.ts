import { create } from 'zustand'
import * as THREE from 'three'

export interface MeshInfo {
  name: string
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
  outlineWidth: 0.005,
  shadingToonyFactor: 0.9,
}

interface AvatarState {
  avatarUrl: string
  setAvatarUrl: (url: string) => void

  meshInfos: MeshInfo[]
  setMeshInfos: (infos: MeshInfo[]) => void
  setMeshVisible: (name: string, visible: boolean) => void
  setMeshLitColor: (name: string, color: string) => void
  setMeshShadeColor: (name: string, color: string) => void

  lighting: Lighting
  setLighting: (patch: Partial<Lighting>) => void

  shader: ShaderParams
  setShader: (patch: Partial<ShaderParams>) => void
}

export const useAvatarStore = create<AvatarState>((set) => ({
  avatarUrl: '/avatars/male_sample.vrm',
  setAvatarUrl: (url) => set({ avatarUrl: url, meshInfos: [] }),

  lighting: LIGHTING_DEFAULTS,
  setLighting: (patch) => set((s) => ({ lighting: { ...s.lighting, ...patch } })),

  shader: SHADER_DEFAULTS,
  setShader: (patch) => set((s) => ({ shader: { ...s.shader, ...patch } })),

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

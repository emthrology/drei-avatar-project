import { create } from 'zustand'
import * as THREE from 'three'

export interface MeshInfo {
  name: string
  visible: boolean
  litColor: string    // hex
  shadeColor: string  // hex
}

interface AvatarState {
  avatarUrl: string
  setAvatarUrl: (url: string) => void

  meshInfos: MeshInfo[]
  setMeshInfos: (infos: MeshInfo[]) => void
  setMeshVisible: (name: string, visible: boolean) => void
  setMeshLitColor: (name: string, color: string) => void
  setMeshShadeColor: (name: string, color: string) => void
}

export const useAvatarStore = create<AvatarState>((set) => ({
  avatarUrl: '/avatars/male_sample.vrm',
  setAvatarUrl: (url) => set({ avatarUrl: url, meshInfos: [] }),

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

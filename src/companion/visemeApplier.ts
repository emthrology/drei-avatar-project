// VRM viseme 적용 헬퍼
// - 모음(aa/E/I/O/U): expressionManager.setValue (Fcl_MTH_A/I/U/E/O 관리)
// - 자음(PP/FF/SS 등): morphTargetInfluences 직접 조작 (Fcl_MTH_Close 등 — preset에 미등록)

import * as THREE from 'three'
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm'
import type { OculusViseme } from './lipsyncEn'

// preset expression이 관리하지 않는 입 모프 — 직접 조작 안전
const CONSONANT_MORPH_NAMES = [
  'Fcl_MTH_Close',
  'Fcl_MTH_Small',
  'Fcl_MTH_Up',
  'Fcl_MTH_Down',
] as const

// 자음 viseme → 모프 기여도 레시피 (VRoid Fcl_MTH_* 기반)
const CONSONANT_RECIPE: Partial<Record<OculusViseme, Record<string, number>>> = {
  PP: { Fcl_MTH_Close: 1.0 },
  FF: { Fcl_MTH_Close: 0.5, Fcl_MTH_Small: 0.4 },
  SS: { Fcl_MTH_Small: 0.5, Fcl_MTH_Close: 0.25 },
  CH: { Fcl_MTH_Small: 0.6, Fcl_MTH_Up: 0.2 },
  DD: { Fcl_MTH_Down: 0.3, Fcl_MTH_Small: 0.15 },
  kk: { Fcl_MTH_Down: 0.2, Fcl_MTH_Small: 0.1 },
  nn: { Fcl_MTH_Down: 0.25 },
  TH: { Fcl_MTH_Down: 0.2 },
  RR: { Fcl_MTH_Small: 0.3 },
}

const VOWEL_PRESET: Partial<Record<OculusViseme, VRMExpressionPresetName>> = {
  aa: VRMExpressionPresetName.Aa,
  E: VRMExpressionPresetName.Ee,
  I: VRMExpressionPresetName.Ih,
  O: VRMExpressionPresetName.Oh,
  U: VRMExpressionPresetName.Ou,
}

export interface MorphEntry {
  mesh: THREE.SkinnedMesh
  index: number
}
export type MorphMap = Map<string, MorphEntry[]>

// VRM 씬에서 자음 모프 위치 수집 (로드 시 1회)
export function buildMorphMap(scene: THREE.Object3D): MorphMap {
  const map: MorphMap = new Map()
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh) || !obj.morphTargetDictionary) return
    for (const name of CONSONANT_MORPH_NAMES) {
      const index = obj.morphTargetDictionary[name]
      if (index === undefined) continue
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push({ mesh: obj, index })
    }
  })
  return map
}

// weight: 0–1. TalkingHead 관행: PP/FF=0.9, 나머지=0.6
export function applyViseme(
  morphMap: MorphMap,
  vrm: VRM,
  viseme: OculusViseme,
  weight: number,
): void {
  const preset = VOWEL_PRESET[viseme]
  if (preset) {
    vrm.expressionManager?.setValue(preset, weight)
    return
  }
  const recipe = CONSONANT_RECIPE[viseme]
  if (!recipe) return // sil 등
  for (const [morphName, morphWeight] of Object.entries(recipe)) {
    const entries = morphMap.get(morphName)
    if (!entries) continue // 비VRoid 모델 fallback: 조용히 스킵
    for (const { mesh, index } of entries) {
      if (mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = morphWeight * weight
      }
    }
  }
}

export function clearVisemes(morphMap: MorphMap, vrm: VRM): void {
  for (const preset of Object.values(VOWEL_PRESET) as VRMExpressionPresetName[]) {
    vrm.expressionManager?.setValue(preset, 0)
  }
  for (const entries of morphMap.values()) {
    for (const { mesh, index } of entries) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = 0
    }
  }
}

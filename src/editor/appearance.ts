import * as THREE from 'three'
import { type ShaderParams, type MeshInfo } from '../store'

// 조립된 씬에 store 외형값(셰이더 + 메시 색)을 적용한다 — 에디터·컴패니언 공유.
// 셰이더(outline/toony)와 머티리얼 색(lit/shade)은 머티리얼 프로퍼티라 양쪽에서 안전히 적용된다.
// **가시성(show/hide)은 제외** — 그건 에디터 전용 메시 토글이고, 컴패니언 가시성은 파츠 로더가
// 소유(얼굴 교체 시 base 얼굴 숨김 등). 가시성까지 적용하면 교체 충돌 위험 → 색/셰이더만.
export function applyAppearance(
  scene: THREE.Object3D,
  shader: ShaderParams,
  meshInfos: MeshInfo[],
) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const info = meshInfos.find((m) => m.name === obj.name)
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((mat) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mat as any
      if (!m.isMToonMaterial) return
      m.outlineWidthFactor = shader.outlineWidth
      m.shadingToonyFactor = shader.shadingToonyFactor
      if (info) {
        m.color?.setStyle(info.litColor)
        m.shadeColorFactor?.setStyle(info.shadeColor)
      }
      m.needsUpdate = true
    })
  })
}

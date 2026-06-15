import { useEffect } from 'react'
import * as THREE from 'three'
import { useAvatarStore, SHADER_DEFAULTS, type ShaderParams } from '../store'

// VRM scene ref를 공유하기 위한 간단한 모듈 싱글톤
// (Zustand에 Three.js 오브젝트를 넣지 않기 위해)
let _vrmScene: THREE.Object3D | null = null
export function setShaderPanelScene(scene: THREE.Object3D | null) {
  _vrmScene = scene
}

export function ShaderPanel() {
  // 값은 store에 보관 → 모드 전환으로 패널이 언마운트돼도 유지
  const { meshInfos, shader: vals, setShader } = useAvatarStore()

  // 값이 바뀔 때마다 씬 traverse해서 MToonMaterial에 적용
  useEffect(() => {
    if (!_vrmScene || meshInfos.length === 0) return

    _vrmScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = mat as any
        if (!m.isMToonMaterial) return
        m.outlineWidthFactor = vals.outlineWidth
        m.shadingToonyFactor = vals.shadingToonyFactor
        m.needsUpdate = true
      })
    })
  }, [vals, meshInfos])

  function update<K extends keyof ShaderParams>(key: K, value: ShaderParams[K]) {
    setShader({ [key]: value })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <SliderRow
        label="아웃라인 굵기"
        value={vals.outlineWidth}
        min={0} max={0.02} step={0.001}
        display={vals.outlineWidth.toFixed(3)}
        onChange={(v) => update('outlineWidth', v)}
      />

      <SliderRow
        label="툰 경계 선명도"
        value={vals.shadingToonyFactor}
        min={0} max={1} step={0.01}
        display={vals.shadingToonyFactor.toFixed(2)}
        onChange={(v) => update('shadingToonyFactor', v)}
      />

      <button
        onClick={() => setShader(SHADER_DEFAULTS)}
        className="mt-1 py-1 rounded text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors"
      >
        초기화
      </button>
    </div>
  )
}

export function SliderRow({
  label, value, min, max, step, display, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-500 font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </label>
  )
}

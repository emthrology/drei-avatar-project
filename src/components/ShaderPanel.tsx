import { useAvatarStore, SHADER_DEFAULTS, type ShaderParams } from '../store'

// 셰이더 슬라이더 → store.shader 갱신만. 실제 씬 머티리얼 적용은 공유 조립 훅
// (useAssembledVrm → appearance.applyAppearance)이 담당 → 에디터·컴패니언 동일 적용.

export function ShaderPanel() {
  // 값은 store에 보관 → 모드 전환으로 패널이 언마운트돼도 유지
  const { shader: vals, setShader } = useAvatarStore()

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

import { useAvatarStore, GRADING_DEFAULTS, type GradingParams } from '../store'
import { SliderRow } from './ShaderPanel'

// 사진편집 스타일 톤 조절 — 전역 컬러 그레이딩 (포스트프로세싱)
export function GradingPanel() {
  const { grading: vals, setGrading } = useAvatarStore()

  function update<K extends keyof GradingParams>(key: K, value: GradingParams[K]) {
    setGrading({ [key]: value })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <SliderRow
        label="밝기"
        value={vals.brightness}
        min={-1} max={1} step={0.01}
        display={vals.brightness.toFixed(2)}
        onChange={(v) => update('brightness', v)}
      />

      <SliderRow
        label="대비"
        value={vals.contrast}
        min={-1} max={1} step={0.01}
        display={vals.contrast.toFixed(2)}
        onChange={(v) => update('contrast', v)}
      />

      <SliderRow
        label="색조"
        value={vals.hue}
        min={-Math.PI} max={Math.PI} step={0.01}
        display={`${Math.round((vals.hue * 180) / Math.PI)}°`}
        onChange={(v) => update('hue', v)}
      />

      <SliderRow
        label="채도"
        value={vals.saturation}
        min={-1} max={1} step={0.01}
        display={vals.saturation.toFixed(2)}
        onChange={(v) => update('saturation', v)}
      />

      <button
        onClick={() => setGrading(GRADING_DEFAULTS)}
        className="mt-1 py-1 rounded text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors"
      >
        초기화
      </button>
    </div>
  )
}

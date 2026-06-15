import { useAvatarStore, LIGHTING_DEFAULTS } from '../store'
import { SliderRow } from './ShaderPanel'

// 에디터 씬 조명 슬라이더. 셰이더(rim/toony)는 음영 의존이라, 조명을 조절해 효과를 드러냄.
//   환경광↓ + 메인광 각도 측면 → 한쪽 그늘 생성 → rim·toony 가시화
export function LightPanel() {
  const { lighting, setLighting } = useAvatarStore()

  return (
    <div className="flex flex-col gap-3 p-4">
      <SliderRow
        label="환경광 강도"
        value={lighting.ambient}
        min={0} max={1} step={0.01}
        display={lighting.ambient.toFixed(2)}
        onChange={(v) => setLighting({ ambient: v })}
      />

      <SliderRow
        label="메인광 강도"
        value={lighting.keyIntensity}
        min={0} max={3} step={0.05}
        display={lighting.keyIntensity.toFixed(2)}
        onChange={(v) => setLighting({ keyIntensity: v })}
      />

      <SliderRow
        label="메인광 각도"
        value={lighting.keyAngle}
        min={0} max={360} step={1}
        display={`${Math.round(lighting.keyAngle)}°`}
        onChange={(v) => setLighting({ keyAngle: v })}
      />

      <button
        onClick={() => setLighting(LIGHTING_DEFAULTS)}
        className="mt-1 py-1 rounded text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors"
      >
        초기화
      </button>
    </div>
  )
}

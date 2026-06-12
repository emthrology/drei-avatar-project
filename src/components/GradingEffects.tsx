import { EffectComposer, BrightnessContrast, HueSaturation } from '@react-three/postprocessing'
import { useAvatarStore } from '../store'

// 컬러 그레이딩 — 렌더된 화면에 입히는 포스트프로세싱 레이어.
// 모델 머티리얼을 안 건드림 → 기존 렌더 비퇴행. 디폴트(전부 0)는 identity라 화면 무변화.
// 주의: 불투명 배경(에디터)용. 투명 배경(컴패니언)은 알파 검증 후 적용.
export function GradingEffects() {
  const { grading } = useAvatarStore()
  return (
    <EffectComposer>
      <BrightnessContrast
        brightness={grading.brightness}
        contrast={grading.contrast}
      />
      <HueSaturation
        hue={grading.hue}
        saturation={grading.saturation}
      />
    </EffectComposer>
  )
}

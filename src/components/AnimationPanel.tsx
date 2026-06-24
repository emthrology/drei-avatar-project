import { useAvatarStore } from '../store'
import { MOODS, IDLE_ARM_POSES } from '../companion/anim/moods'

// 에디터 라이브 프리뷰 컨트롤 — 디버그 패널 없는 에디터에서 모션을 바로 확인/조정.
// 컴패니언과 동일한 절차 엔진(useAnimator)을 ComposerAvatar 가 store.animPreview 로 켜고,
// 무드/제스처/idle 포즈는 컴패니언 DebugPanel 과 같은 window 이벤트로 트리거(엔진이 전역 수신).
// (이전엔 VRoid VRM 에 내장 클립이 없어 빈 AnimationMixer 패널이었음 → 라이브 프리뷰로 교체)

const GESTURE_LABELS = MOODS.neutral.gestures.map((g, i) => g.label ?? `제스처 ${i}`)
const IDLE_POSE_LABELS = IDLE_ARM_POSES.map((p, i) => p.label ?? `포즈 ${i}`)
const MOOD_NAMES = Object.keys(MOODS)

const triggerMood = (mood: string) =>
  window.dispatchEvent(new CustomEvent('companion:mood', { detail: { mood } }))
const triggerGesture = (index: number) =>
  window.dispatchEvent(new CustomEvent('companion:gesture', { detail: { index } }))
const triggerIdlePose = (index: number) =>
  window.dispatchEvent(new CustomEvent('companion:idlepose', { detail: { index } }))

export function AnimationPanel() {
  const animPreview = useAvatarStore((s) => s.animPreview)
  const setAnimPreview = useAvatarStore((s) => s.setAnimPreview)

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* 프리뷰 토글 */}
      <button
        onClick={() => setAnimPreview(!animPreview)}
        className={`py-2 px-3 rounded text-xs font-medium transition-colors ${
          animPreview
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        {animPreview ? '⏸ 라이브 프리뷰 끄기 (정적 포즈)' : '▶ 라이브 프리뷰 켜기'}
      </button>

      {!animPreview ? (
        <p className="text-xs text-gray-600 leading-relaxed">
          켜면 컴패니언과 동일한 절차 애니메이션(호흡·머리·포즈·눈깜빡임)으로 캐릭터가
          움직입니다. 끄면 색/셰이더 편집용 정적 포즈로 돌아갑니다.
        </p>
      ) : (
        <>
          {/* 무드(표정) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">무드 (표정)</span>
            <div className="flex flex-wrap gap-1">
              {MOOD_NAMES.map((mood) => (
                <button
                  key={mood}
                  onClick={() => triggerMood(mood)}
                  className="py-1 px-2 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>

          {/* 제스처 (1회 발동) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">제스처 (1회)</span>
            <div className="grid grid-cols-2 gap-1">
              {GESTURE_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => triggerGesture(i)}
                  className="py-1 px-2 rounded text-xs text-left bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* idle 팔 포즈 (1회) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">idle 팔 포즈 (1회)</span>
            <div className="flex flex-wrap gap-1">
              {IDLE_POSE_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => triggerIdlePose(i)}
                  className="py-1 px-2 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

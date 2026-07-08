import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei'
import { useGameEvents } from './useGameEvents'
import { CompanionAvatar, type CameraSettings } from './CompanionAvatar'
import { googleTTS, type SpeakPayload } from './tts'
import { type Lang, type Gender, type Reaction, type MoodName } from './locales'
import { SceneLights } from '../components/SceneLights'
import { GradingEffects } from '../components/GradingEffects'
import { useAvatarStore } from '../store'

const TTS_API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY

interface Props {
  // 업로드 오버라이드(있으면 단일 VRM). 없으면 store 조립 아바타(에디터에서 조합한 결과).
  uploadUrl?: string | null
  lang: Lang
  gender: Gender
  onStatusChange?: (status: 'loading' | 'ready' | 'speaking') => void
  onSpeak?: (text: string) => void
}

// VRM 로드 후 계산된 본 기반 카메라 세팅을 적용
function CameraRig({ settings }: { settings: CameraSettings }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(...settings.position)
    camera.lookAt(...settings.target)
  }, [settings, camera])
  return null
}

// 컴패니언은 게임 위 오버레이 — 게임이 무거우면 이 캔버스가 FPS를 더 잠식.
// PerformanceMonitor(FPS 측정)를 직접 setDpr에 연결(drei의 <AdaptiveDpr>는 R3F
// performance.regress()에 반응하는데, 이 캔버스는 OrbitControls가 없어 regress를
// 아무도 안 불러 무동작 — 그래서 여기선 콜백에서 직접 dpr을 낮춤/복원).
function DprGovernor() {
  const setDpr = useThree((s) => s.setDpr)
  const initialDpr = useThree((s) => s.viewport.initialDpr)
  const handleChange = useCallback(
    (api: PerformanceMonitorApi) => setDpr(Math.max(1, initialDpr * api.factor)),
    [setDpr, initialDpr],
  )
  return <PerformanceMonitor onIncline={handleChange} onDecline={handleChange} />
}

export function CompanionOverlay({ uploadUrl, lang, gender, onStatusChange, onSpeak }: Props) {
  const characterId = useAvatarStore((s) => s.characterId)
  // 소스 변경(업로드/캐릭터 전환) 시 리마운트 키 — 새 base 로 깨끗이 재조립
  const sourceKey = uploadUrl ?? characterId
  const speakRef = useRef<((payload: SpeakPayload) => void) | null>(null)
  const [bubble, setBubble] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'speaking'>('loading')
  const [mood, setMood] = useState<MoodName>('neutral')
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | null>(null)

  function updateStatus(s: 'loading' | 'ready' | 'speaking') {
    setStatus(s)
    onStatusChange?.(s)
  }

  const handleReady = useCallback((speak: (payload: SpeakPayload) => void) => {
    speakRef.current = speak
    updateStatus('ready')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStatusChange])

  const handleReaction = useCallback(async (reaction: Reaction, nextMood: MoodName) => {
    setBubble(reaction.text)
    setMood(nextMood)
    updateStatus('speaking')
    onSpeak?.(reaction.text)

    // 발화 종료: 말풍선/상태 정리 + 무드를 neutral로 복귀 (표정 ramp는 useAnimator가 처리)
    const end = () => {
      setBubble(null)
      setMood('neutral')
      updateStatus('ready')
    }

    if (TTS_API_KEY) {
      try {
        const payload = await googleTTS(reaction, lang, gender, TTS_API_KEY)
        speakRef.current?.(payload)
        setTimeout(end, payload.audio.duration * 1000 + 500)
      } catch (e) {
        console.error('TTS failed:', e)
        end()
      }
    } else {
      setTimeout(end, 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, gender, onStatusChange, onSpeak])

  useGameEvents(handleReaction, lang)

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      width: 300,
      height: 400,
      pointerEvents: 'none',
      zIndex: 1000,
    }}>
      <Canvas
        camera={{ position: [0, 1.4, 2.5], fov: 28 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* 게임 위 오버레이 FPS 보호 — 하락 감지 시 DPR 강하, 회복 시 복원 */}
        <DprGovernor />

        {/* 에디터와 공유 조명 (store.lighting) — 에디터에서 조절하면 컴패니언도 반영 */}
        <SceneLights />

        <Suspense fallback={null}>
          <CompanionAvatar
            key={sourceKey}
            uploadUrl={uploadUrl}
            speaking={status === 'speaking'}
            mood={mood}
            onReady={handleReady}
            onCameraReady={setCameraSettings}
          />
        </Suspense>

        {/* VRM 로드 완료 후 본 기반으로 카메라 세팅 적용 */}
        {cameraSettings && <CameraRig settings={cameraSettings} />}

        {/* 톤 그레이딩 — 에디터와 store.grading 공유. 투명 배경 알파 보존 검증 대상 */}
        <GradingEffects />
      </Canvas>

      {/* 말풍선 — Canvas 위에 올라오도록 Canvas 이후 선언 */}
      {bubble && (
        <div style={{
          position: 'absolute',
          bottom: 320,
          right: 10,
          maxWidth: 200,
          background: 'rgba(255,255,255,0.92)',
          color: '#222',
          borderRadius: 12,
          padding: '8px 12px',
          fontSize: 13,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}>
          💬 {bubble}
        </div>
      )}

      {/* 상태 뱃지 */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        fontSize: 10,
        color: status === 'ready' ? '#4ade80' : status === 'speaking' ? '#facc15' : '#94a3b8',
        background: 'rgba(0,0,0,0.4)',
        padding: '2px 6px',
        borderRadius: 4,
      }}>
        {status}
      </div>
    </div>
  )
}

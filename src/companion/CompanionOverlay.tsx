import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { useGameEvents } from './useGameEvents'
import { CompanionAvatar, type CameraSettings } from './CompanionAvatar'
import { googleTTS, type SpeakPayload } from './tts'
import { type Lang, type Reaction } from './locales'

const TTS_API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY

interface Props {
  avatarUrl: string
  lang: Lang
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

export function CompanionOverlay({ avatarUrl, lang, onStatusChange, onSpeak }: Props) {
  const speakRef = useRef<((payload: SpeakPayload) => void) | null>(null)
  const [bubble, setBubble] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'speaking'>('loading')
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

  const handleReaction = useCallback(async (reaction: Reaction) => {
    setBubble(reaction.text)
    updateStatus('speaking')
    onSpeak?.(reaction.text)

    if (TTS_API_KEY) {
      try {
        const payload = await googleTTS(reaction, lang, TTS_API_KEY)
        speakRef.current?.(payload)
        setTimeout(() => {
          setBubble(null)
          updateStatus('ready')
        }, payload.audio.duration * 1000 + 500)
      } catch (e) {
        console.error('TTS failed:', e)
        setBubble(null)
        updateStatus('ready')
      }
    } else {
      setTimeout(() => { setBubble(null); updateStatus('ready') }, 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, onStatusChange, onSpeak])

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
      {/* 말풍선 */}
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

      <Canvas
        camera={{ position: [0, 1.4, 2.5], fov: 28 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[0.5, 2, 2]} intensity={2.0} />
        <directionalLight position={[-1, 1, -2]} intensity={0.4} />

        <Suspense fallback={null}>
          <CompanionAvatar
            key={avatarUrl}
            url={avatarUrl}
            speaking={status === 'speaking'}
            onReady={handleReady}
            onCameraReady={setCameraSettings}
          />
        </Suspense>

        {/* VRM 로드 완료 후 본 기반으로 카메라 세팅 적용 */}
        {cameraSettings && <CameraRig settings={cameraSettings} />}
      </Canvas>
    </div>
  )
}

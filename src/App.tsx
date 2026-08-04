import { useState } from 'react'
import { EditorScene } from './editor/EditorScene'
import { CompanionOverlay } from './companion/CompanionOverlay'
import { DebugPanel } from './companion/DebugPanel'
import { type Lang, type Gender } from './companion/locales'

// ?mode=companion — 툴링(scripts/probeMotion.mjs)이 클릭 없이 컴패니언으로 진입하는 경로.
// 기본값은 editor 그대로라 사람 사용엔 무변화(비퇴행).
function initialMode(): 'editor' | 'companion' {
  return new URLSearchParams(window.location.search).get('mode') === 'companion' ? 'companion' : 'editor'
}

export default function App() {
  const [mode, setMode] = useState<'editor' | 'companion'>(initialMode)
  const [lang, setLang] = useState<Lang>('en')
  const [gender, setGender] = useState<Gender>('male') // 번들 샘플이 남성 → 기본 male

  // 컴패니언 배경 — 투명도 검증용 디버그. 체커보드면 캔버스 투명 여부가 명확히 보임
  const [companionBg, setCompanionBg] = useState<'default' | 'checker' | 'magenta' | 'white'>('default')
  const BG_CYCLE: typeof companionBg[] = ['default', 'checker', 'magenta', 'white']
  const bgStyle: React.CSSProperties =
    companionBg === 'checker'
      ? {
          backgroundColor: '#fff',
          backgroundImage:
            'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
        }
      : companionBg === 'magenta'
      ? { backgroundColor: '#ff00ff' }
      : companionBg === 'white'
      ? { backgroundColor: '#ffffff' }
      : {}

  // 컴패니언 모드 디버그 상태
  const [companionStatus, setCompanionStatus] = useState<'loading' | 'ready' | 'speaking'>('loading')
  const [lastText, setLastText] = useState('')
  const [companionAvatarUrl, setCompanionAvatarUrl] = useState<string | null>(null)

  function dispatchGameEvent(type: string) {
    window.dispatchEvent(new CustomEvent('game:event', { detail: { type } }))
  }

  function handleAvatarLoad(url: string, _label: string) {
    setCompanionAvatarUrl(url)
    setCompanionStatus('loading')
    setLastText('')
  }

  return (
    <div className="flex w-full h-full bg-gray-950 relative">
      {/* 모드 전환 툴바 — DebugPanel(z-9999)보다 위에 둬서 항상 클릭 가능 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5">
        <button
          onClick={() => setMode('editor')}
          className={`text-xs px-3 py-1 rounded transition-colors ${
            mode === 'editor' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          에디터
        </button>
        <button
          onClick={() => setMode('companion')}
          className={`text-xs px-3 py-1 rounded transition-colors ${
            mode === 'companion' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          컴패니언
        </button>

        {mode === 'companion' && (
          <>
            <div className="w-px h-4 bg-gray-700 mx-1" />
            <button
              onClick={() => setLang(l => l === 'en' ? 'ko' : 'en')}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
            >
              {lang.toUpperCase()}
            </button>
            <button
              onClick={() => setCompanionBg(b => BG_CYCLE[(BG_CYCLE.indexOf(b) + 1) % BG_CYCLE.length])}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
              title="투명도 검증용 배경 전환"
            >
              BG: {companionBg}
            </button>
          </>
        )}
      </div>

      {/* 에디터 모드 — 조립(authored base + 모듈 파츠) */}
      {mode === 'editor' && (
        <div className="flex-1">
          <EditorScene />
        </div>
      )}

      {/* 컴패니언 모드 */}
      {mode === 'companion' && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-sm select-none" style={bgStyle}>
          Game Area
          <DebugPanel
            status={companionStatus}
            lastText={lastText}
            lang={lang}
            gender={gender}
            onEvent={dispatchGameEvent}
            onLangChange={setLang}
            onGenderChange={setGender}
            onAvatarLoad={handleAvatarLoad}
          />
          <CompanionOverlay
            uploadUrl={companionAvatarUrl}
            lang={lang}
            gender={gender}
            onStatusChange={setCompanionStatus}
            onSpeak={setLastText}
          />
        </div>
      )}
    </div>
  )
}

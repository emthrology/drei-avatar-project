import { useState } from 'react'
import { AvatarScene } from './components/AvatarScene'
import { EditorPanel } from './components/EditorPanel'
import { CompanionOverlay } from './companion/CompanionOverlay'
import { DebugPanel } from './companion/DebugPanel'
import { useAvatarStore } from './store'
import { type Lang, type Gender } from './companion/locales'

export default function App() {
  const { avatarUrl } = useAvatarStore()
  const [mode, setMode] = useState<'editor' | 'companion'>('editor')
  const [lang, setLang] = useState<Lang>('en')
  const [gender, setGender] = useState<Gender>('male') // 번들 샘플이 남성 → 기본 male

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

  const effectiveAvatarUrl = companionAvatarUrl ?? (avatarUrl || '/avatars/male_sample.vrm')

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
          </>
        )}
      </div>

      {/* 에디터 모드 */}
      {mode === 'editor' && (
        <>
          <div className="flex-1 relative">
            <AvatarScene avatarUrl={avatarUrl} />
          </div>
          <div className="w-72 shrink-0 border-l border-gray-800">
            <EditorPanel />
          </div>
        </>
      )}

      {/* 컴패니언 모드 */}
      {mode === 'companion' && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-sm select-none">
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
            key={effectiveAvatarUrl}
            avatarUrl={effectiveAvatarUrl}
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

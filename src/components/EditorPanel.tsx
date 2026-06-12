import { useRef, useState } from 'react'
import { useAvatarStore } from '../store'
import { ShaderPanel } from './ShaderPanel'
import { LightPanel } from './LightPanel'
import { GradingPanel } from './GradingPanel'
import { AnimationPanel } from './AnimationPanel'

export function EditorPanel() {
  const {
    avatarUrl, setAvatarUrl,
    meshInfos, setMeshVisible, setMeshLitColor, setMeshShadeColor,
  } = useAvatarStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUrl(URL.createObjectURL(file))
    setSelectedMesh(null)
  }

  const selected = meshInfos.find((m) => m.name === selectedMesh)

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* 상단 고정 헤더 */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-indigo-400 mb-3">Avatar Editor</h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
        >
          .vrm / .glb 불러오기
        </button>
        <input ref={fileInputRef} type="file" accept=".vrm,.glb" className="hidden" onChange={handleFileChange} />
        {avatarUrl && (
          <p className="mt-1 text-xs text-gray-500 truncate">
            {avatarUrl.startsWith('blob:') ? '로컬 파일' : avatarUrl}
          </p>
        )}
      </div>

      {/* 파츠 목록 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 메시 리스트 */}
        <div className="w-1/2 border-r border-gray-800 overflow-y-auto">
          <p className="px-3 py-2 text-xs font-medium text-gray-400 sticky top-0 bg-gray-900">파츠</p>
          {meshInfos.length === 0 && (
            <p className="px-3 text-xs text-gray-600">로딩 중...</p>
          )}
          {meshInfos.map((m) => (
            <div
              key={m.name}
              onClick={() => setSelectedMesh(m.name)}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-gray-800 ${
                selectedMesh === m.name ? 'bg-gray-800 text-indigo-300' : 'text-gray-300'
              }`}
            >
              {/* 가시성 토글 */}
              <button
                onClick={(e) => { e.stopPropagation(); setMeshVisible(m.name, !m.visible) }}
                className={`w-4 h-4 rounded border text-center leading-none ${
                  m.visible ? 'border-indigo-400 text-indigo-400' : 'border-gray-600 text-gray-600'
                }`}
                title={m.visible ? '숨기기' : '보이기'}
              >
                {m.visible ? '●' : '○'}
              </button>
              <span className="truncate">{m.name || '(unnamed)'}</span>
            </div>
          ))}
        </div>

        {/* 색상 편집 */}
        <div className="w-1/2 overflow-y-auto p-3">
          <p className="text-xs font-medium text-gray-400 mb-3">색상</p>
          {selected ? (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-indigo-300 truncate">{selected.name}</p>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Lit (밝은 면)</span>
                <input
                  type="color"
                  value={selected.litColor}
                  onChange={(e) => setMeshLitColor(selected.name, e.target.value)}
                  className="w-full h-8 rounded cursor-pointer bg-transparent border border-gray-700"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Shade (그림자 면)</span>
                <input
                  type="color"
                  value={selected.shadeColor}
                  onChange={(e) => setMeshShadeColor(selected.name, e.target.value)}
                  className="w-full h-8 rounded cursor-pointer bg-transparent border border-gray-700"
                />
              </label>
            </div>
          ) : (
            <p className="text-xs text-gray-600">파츠를 선택하세요</p>
          )}
        </div>
      </div>

      {/* Phase 3: 셰이더 */}
      <div className="border-t border-gray-800">
        <ShaderPanel />
      </div>

      {/* 조명 — 셰이더(rim/toony) 효과를 드러내는 음영 조절 */}
      <div className="border-t border-gray-800">
        <LightPanel />
      </div>

      {/* 톤 — 사진편집 스타일 컬러 그레이딩 (포스트프로세싱) */}
      <div className="border-t border-gray-800">
        <GradingPanel />
      </div>

      {/* Phase 4: 애니메이션 */}
      <div className="border-t border-gray-800">
        <AnimationPanel />
      </div>
    </div>
  )
}

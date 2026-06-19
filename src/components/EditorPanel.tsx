import { useState } from 'react'
import { useAvatarStore } from '../store'
import { Section } from './Section'
import { ShaderPanel } from './ShaderPanel'
import { LightPanel } from './LightPanel'
import { GradingPanel } from './GradingPanel'
import { AnimationPanel } from './AnimationPanel'

export function EditorPanel() {
  const {
    meshInfos, setMeshVisible, setMeshLitColor, setMeshShadeColor,
  } = useAvatarStore()

  const [selectedMesh, setSelectedMesh] = useState<string | null>(null)
  // 단일 오픈 아코디언: 한 번에 하나만 펼침(같은 헤더 재클릭 시 닫힘)
  const [openSection, setOpenSection] = useState<string>('파츠 / 색상')
  const toggle = (id: string) => setOpenSection((cur) => (cur === id ? '' : id))

  const selected = meshInfos.find((m) => m.name === selectedMesh)

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* 상단 고정 헤더 — 조립(authored base+parts). 파츠 선택은 좌측 카탈로그 피커. */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-indigo-400">Avatar Editor</h2>
        <p className="mt-1 text-xs text-gray-500">파츠는 좌측 카탈로그에서 선택 · 여기선 색/셰이더/조명/톤 조정</p>
      </div>

      {/* 본문 — 전체 스크롤(안전망) + 접이식 섹션(공간 관리) */}
      <div className="flex-1 overflow-y-auto">
        {/* 파츠 / 색상 — bounded 높이 + 컬럼 내부 스크롤 (공간 독식 방지) */}
        <Section title="파츠 / 색상" open={openSection === '파츠 / 색상'} onToggle={() => toggle('파츠 / 색상')}>
          <div className="flex h-64 overflow-hidden">
            {/* 메시 리스트 */}
            <div className="w-1/2 border-r border-gray-800 overflow-y-auto">
              {meshInfos.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-600">로딩 중...</p>
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
                  <span className="truncate" title={m.name}>{m.label || m.name || '(unnamed)'}</span>
                </div>
              ))}
            </div>

            {/* 색상 편집 */}
            <div className="w-1/2 overflow-y-auto p-3">
              {selected ? (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-indigo-300 truncate" title={selected.name}>{selected.label || selected.name}</p>

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
        </Section>

        <Section title="셰이더 (MToon)" open={openSection === '셰이더 (MToon)'} onToggle={() => toggle('셰이더 (MToon)')}><ShaderPanel /></Section>
        <Section title="조명" open={openSection === '조명'} onToggle={() => toggle('조명')}><LightPanel /></Section>
        <Section title="톤 (컬러 그레이딩)" open={openSection === '톤 (컬러 그레이딩)'} onToggle={() => toggle('톤 (컬러 그레이딩)')}><GradingPanel /></Section>
        <Section title="애니메이션" open={openSection === '애니메이션'} onToggle={() => toggle('애니메이션')}><AnimationPanel /></Section>
      </div>
    </div>
  )
}

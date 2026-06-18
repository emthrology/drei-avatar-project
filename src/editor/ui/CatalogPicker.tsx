import { useState } from 'react'
import { PartCategory, PartCategoryDef, PartStatus, Selection } from '../constants'
import { VariantCard } from './VariantCard'

// VRoid식 피커: 상단 카테고리 탭 + 활성 카테고리의 변형 썸네일 그리드.
// 카테고리 슬롯당 1개 선택(swap-on-select). allowNone 이면 '원본/없음' 카드 선두.
// (스크린샷의 좌측 서브카테고리 rail 은 서브카테고리 도입 시 추가 — 지금은 플랫 4 카테고리.)
const EYE_SWATCHES = ['#5a8fd6', '#5fae6b', '#b0553a', '#8a6bd0']

interface Props {
  catalog: PartCategoryDef[]
  selection: Selection
  status: Record<string, PartStatus>
  onSelect: (cat: PartCategory, variantId: string | null) => void
  eyeColor: string | null
  onEyeColor: (hex: string | null) => void
}

export function CatalogPicker({ catalog, selection, status, onSelect, eyeColor, onEyeColor }: Props) {
  const [active, setActive] = useState<PartCategory>(catalog[0].id)
  // 카탈로그(캐릭터) 교체 시 active 가 새 카탈로그에 없을 수 있다(예: female 은 hair 탭 없음) → 첫 탭으로 클램프.
  const cat = catalog.find((c) => c.id === active) ?? catalog[0]

  return (
    <div className="flex flex-col h-full">
      {/* 상단 탭 바 */}
      <div className="flex items-center gap-1 px-2 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        {catalog.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              cat.id === c.id ? 'border-sky-400 text-sky-300' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 변형 그리드 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {cat.allowNone && (
            <VariantCard
              variant={null}
              label="원본"
              selected={selection[cat.id] == null}
              onClick={() => onSelect(cat.id, null)}
            />
          )}
          {cat.variants.map((v) => (
            <VariantCard
              key={v.id}
              variant={v}
              label={v.label}
              selected={selection[cat.id] === v.id}
              status={status[cat.id]}
              onClick={() => onSelect(cat.id, v.id)}
            />
          ))}
        </div>

        {/* 텍스처 축: 눈색 (Face 탭에서만) */}
        {cat.id === 'face' && (
          <div className="mt-3 border-t border-gray-800 pt-3">
            <span className="text-[11px] text-gray-400">눈색 (텍스처 축)</span>
            <div className="flex gap-1.5 items-center mt-1.5">
              <button
                onClick={() => onEyeColor(null)}
                className={`text-[11px] px-2 py-1 rounded ${eyeColor === null ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                원본
              </button>
              {EYE_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => onEyeColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full border-2 ${eyeColor === c ? 'border-white' : 'border-transparent'}`}
                  title={c}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { PartStatus, PartVariant } from '../constants'

// 카탈로그 그리드의 카드 1칸 — 썸네일 PNG + 라벨 + 선택 체크.
// variant=null 이면 '원본/없음' 카드(점선 원). 썸네일이 아직 없으면(npm run thumbs 전) 라벨 폴백.
interface Props {
  variant: PartVariant | null
  label: string
  selected: boolean
  status?: PartStatus
  onClick: () => void
}

export function VariantCard({ variant, label, selected, status, onClick }: Props) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const showThumb = variant && !thumbFailed
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative aspect-square rounded-lg border-2 overflow-hidden bg-gray-800 transition-colors ${
        selected ? 'border-sky-400' : 'border-transparent hover:border-gray-600'
      }`}
    >
      {variant == null ? (
        // 원본/없음
        <span className="flex items-center justify-center w-full h-full">
          <span className="w-8 h-8 rounded-full border-2 border-dashed border-sky-400/70" />
        </span>
      ) : showThumb ? (
        <img
          src={variant.thumb}
          alt={label}
          className="w-full h-full object-cover"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        // 썸네일 폴백: 라벨 카드
        <span className="flex items-center justify-center w-full h-full px-1 text-[10px] leading-tight text-gray-300 text-center">
          {label}
        </span>
      )}

      {/* 라벨 하단 바 */}
      {variant != null && showThumb && (
        <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[9px] leading-tight text-gray-100 px-1 py-0.5 truncate">
          {label}
        </span>
      )}
      {variant == null && (
        <span className="absolute inset-x-0 bottom-0 text-[9px] text-gray-300 py-0.5">원본</span>
      )}

      {/* 선택 체크 */}
      {selected && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-sky-500 text-white text-[10px] flex items-center justify-center">✓</span>
      )}
      {/* 로드 상태 */}
      {status === 'loading' && (
        <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" title="로딩" />
      )}
      {status === 'error' && (
        <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-red-500" title="에러" />
      )}
    </button>
  )
}

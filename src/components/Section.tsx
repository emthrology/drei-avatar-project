import { type ReactNode } from 'react'

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

// 에디터 패널 공용 접이식 섹션 (아코디언). 열림 상태는 부모가 소유(controlled)해
// 한 번에 하나만 펼치는 단일 오픈 동작. 본문은 부모가 스크롤.
export function Section({ title, open, onToggle, children }: SectionProps) {
  return (
    <div className="border-t border-gray-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <span>{title}</span>
        <span className={`text-gray-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {/* grid 0fr↔1fr: 동적 높이도 부드럽게 ease (display 토글은 애니메이션 불가) */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PocAvatar } from './PocAvatar'

// 에셋 스왑 PoC 씬 — 좌측 3D, 우측 컨트롤. 검증 결과는 우측 하단 리포트로.
const MORPHS = ['happy', 'angry', 'sad', 'surprised', 'aa', 'oh'] as const

export function PocScene() {
  const [hair, setHair] = useState(true)
  const [shirt, setShirt] = useState(true)
  const [morph, setMorph] = useState(0)
  const [morphName, setMorphName] = useState<string>('happy')
  const [wave, setWave] = useState(false)
  const [report, setReport] = useState<string[]>([])

  return (
    <div className="flex w-full h-full bg-gray-950">
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 1.3, 1.5], fov: 35 }}>
          <ambientLight intensity={1.0} />
          <directionalLight position={[1, 2, 2]} intensity={1.3} />
          <Suspense fallback={null}>
            <PocAvatar
              hair={hair}
              shirt={shirt}
              morph={morph}
              morphName={morphName}
              wave={wave}
              onReport={setReport}
            />
          </Suspense>
          <OrbitControls makeDefault target={[0, 1.2, 0]} minDistance={0.4} maxDistance={5} />
        </Canvas>
      </div>

      <div className="w-72 shrink-0 border-l border-gray-800 bg-gray-900 text-gray-100 p-4 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-amber-400">에셋 스왑 PoC</h2>

        {/* ① + ② 토글 */}
        <div className="flex flex-col gap-2">
          <Toggle label="① 헤어 (리지드 부착)" on={hair} onClick={() => setHair((v) => !v)} />
          <Toggle label="② 셔츠 쉘 (스킨드 rebind)" on={shirt} onClick={() => setShirt((v) => !v)} />
          <Toggle label="팔/머리 흔들기 (추종 검증)" on={wave} onClick={() => setWave((v) => !v)} accent="emerald" />
        </div>

        {/* ③ 모프 */}
        <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
          <span className="text-xs text-gray-400">③ face 모프 슬라이더</span>
          <div className="grid grid-cols-3 gap-1">
            {MORPHS.map((m) => (
              <button
                key={m}
                onClick={() => setMorphName(m)}
                className={`text-xs py-1 rounded ${
                  morphName === m ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={morph}
            onChange={(e) => setMorph(parseFloat(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-gray-500 text-right">{morph.toFixed(2)}</span>
        </div>

        {/* 검증 리포트 */}
        <div className="mt-auto border-t border-gray-800 pt-3">
          <span className="text-xs text-gray-400">검증 리포트</span>
          <ul className="mt-1 flex flex-col gap-1">
            {report.length === 0 && <li className="text-xs text-gray-600">로딩 중…</li>}
            {report.map((r, i) => (
              <li key={i} className="text-[11px] leading-snug text-gray-300">{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, on, onClick, accent = 'amber' }: {
  label: string; on: boolean; onClick: () => void; accent?: 'amber' | 'emerald'
}) {
  const onBg = accent === 'emerald' ? 'bg-emerald-600' : 'bg-amber-600'
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded text-xs transition-colors ${
        on ? `${onBg} text-white` : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
      }`}
    >
      <span>{label}</span>
      <span>{on ? '● ON' : '○ OFF'}</span>
    </button>
  )
}

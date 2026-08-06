// VRMA 애셋 물색 패널 — `?vrma=1` 일 때만 나타난다(기본 UI 무변경).
//
// 정식 채택분(손인사)은 anim/vrma/clips.ts 카탈로그에 있고, 이 패널은 **새 .vrma 를 들일지
// 눈으로 거르는 용도**다. 새 파일을 `public/animations/` 에 두고 아래 배열에 1줄 추가 →
// 재생해 보고 쓸 만하면 정식 카탈로그로 승격하는 흐름.
//
// 조달 경로: Mixamo → fbx2vrma-converter(MIT) / Blender VRM Add-on export / BOOTH.
// 상세 docs/vrma-adoption.md

import type { VrmaClipDef } from '../../companion/anim/vrma/clips';

// VRoid 공식 무료 7종(BOOTH) + 우리 개조본. 원본은 전신 쇼케이스라 대부분 그대로는 못 쓴다 —
// 정적임 실측(hips 이동/회전, 부위별 각이동)에서 03 이 최소라 개조 베이스가 됐다.
const BROWSE: VrmaClipDef[] = [
  {
    id: 'wave',
    label: '★ wave (03 개조본)',
    url: '/animations/wave.vrma',
    from: 2.9,
    to: 5.9,
  },
  { id: 'v01', label: '01 전신보이기', url: '/animations/VRMA_01.vrma' },
  { id: 'v02', label: '02 인사', url: '/animations/VRMA_02.vrma' },
  {
    id: 'v03',
    label: '03 브이사인 (가장 정적)',
    url: '/animations/VRMA_03.vrma',
  },
  { id: 'v04', label: '04 슛', url: '/animations/VRMA_04.vrma' },
  { id: 'v05', label: '05 회전', url: '/animations/VRMA_05.vrma' },
  { id: 'v06', label: '06 모델포즈', url: '/animations/VRMA_06.vrma' },
  { id: 'v07', label: '07 스쿼트', url: '/animations/VRMA_07.vrma' },
];

const play = (def: VrmaClipDef) =>
  window.dispatchEvent(new CustomEvent('companion:vrma', { detail: def }));
const wave = () => window.dispatchEvent(new Event('companion:wave'));
const waveProc = () => window.dispatchEvent(new Event('companion:wave-proc'));

export function VrmaPanel() {
  return (
    <div className="flex flex-col gap-1.5 border-t border-gray-800 pt-3 mt-1">
      <span className="text-[11px] uppercase tracking-wide text-amber-600">
        🧪 VRMA 애셋 물색
      </span>

      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={wave}
          className="py-1 px-2 rounded text-xs bg-indigo-900/50 text-indigo-200 hover:bg-indigo-800/60 transition-colors"
        >
          손인사 (VRMA·정식)
        </button>
        <button
          onClick={waveProc}
          className="py-1 px-2 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          손인사 (절차·기준선)
        </button>
      </div>

      <span className="text-[11px] text-gray-500 mt-1">
        클립 전체 재생 (전신)
      </span>
      <div className="grid grid-cols-2 gap-1">
        {BROWSE.map((c) => (
          <button
            key={c.id}
            onClick={() => play(c)}
            className="py-1 px-2 rounded text-xs text-left bg-amber-950/40 text-amber-200 hover:bg-amber-900/50 transition-colors"
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        재생 중엔 VRMA 가 전신 본을 가져가고(부분 추출은 더 어색해져 반려),
        끝나면 살아있는 idle 로 블렌드 복귀한다. 표정·립싱크·시선은 VRMA 에
        채널이 없어 내내 유지된다.
      </p>
    </div>
  );
}

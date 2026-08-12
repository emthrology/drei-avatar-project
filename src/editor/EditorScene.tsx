import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  ContactShadows,
  Html,
  useProgress,
} from '@react-three/drei';
import { ComposerAvatar } from './ComposerAvatar';
import { CatalogPicker } from './ui/CatalogPicker';
import { SceneLights } from '../components/SceneLights';
import { GradingEffects } from '../components/GradingEffects';
import { EditorPanel } from '../components/EditorPanel';
import { useAvatarStore } from '../store';
import { CHARACTERS, getCharacter } from './constants';

// 에디터 = 조립(authored base + 모듈 파츠). composer식 좌측 전용 패널(캐릭터 셀렉터 + 카탈로그
// 피커) + 중앙 3D(drei 정책: SceneLights/GradingEffects/ContactShadows) + 우측 공유 설정 패널.
// VRM 로딩 중 진행률 표시 (12MB급이라 회색 박스보다 체감 개선). useProgress는 Suspense 트리거
// 리소스(useGLTF 등) 전역 카운트라 base+파츠 전체 로딩을 % 로 반영.
function LoadingIndicator() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="whitespace-nowrap rounded bg-gray-900/80 px-3 py-1.5 text-xs text-gray-300">
        로딩 중... {Math.round(progress)}%
      </div>
    </Html>
  );
}

export function EditorScene() {
  const characterId = useAvatarStore((s) => s.characterId);
  const setCharacter = useAvatarStore((s) => s.setCharacter);
  const selection = useAvatarStore((s) => s.selection);
  const partStatus = useAvatarStore((s) => s.partStatus);
  const setSelection = useAvatarStore((s) => s.setSelection);
  const colorSets = useAvatarStore((s) => s.colorSets);
  const setColorSet = useAvatarStore((s) => s.setColorSet);

  const character = getCharacter(characterId);

  return (
    <div className="flex w-full h-full bg-gray-950 text-gray-100">
      {/* 좌측: 캐릭터 셀렉터 + 카탈로그 피커 */}
      <div className="w-72 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="flex items-center gap-1 p-2 border-b border-gray-800">
          {CHARACTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setCharacter(ch.id)}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                characterId === ch.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <CatalogPicker
            catalog={character.catalog}
            selection={selection}
            status={partStatus}
            onSelect={setSelection}
            colorSets={colorSets}
            onColorSet={setColorSet}
          />
        </div>
      </div>

      {/* 중앙: 3D */}
      <div className="flex-1 relative">
        <Canvas
          camera={{ position: [0, 1.4, 2.5], fov: 35 }}
          shadows
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#1a1a2e']} />
          <SceneLights castShadow />
          <Suspense fallback={<LoadingIndicator />}>
            <ComposerAvatar
              key={characterId}
              baseUrl={character.baseUrl}
              catalog={character.catalog}
            />
            <ContactShadows
              position={[0, -0.01, 0]}
              opacity={0.4}
              scale={4}
              blur={2}
            />
          </Suspense>
          <OrbitControls
            makeDefault
            target={[0, 1.0, 0]}
            minDistance={0.5}
            maxDistance={6}
            enablePan
            zoomToCursor
          />
          <GradingEffects />
        </Canvas>
      </div>

      {/* 우측: 공유 설정 패널 (색상/셰이더/조명/톤/애니) */}
      <div className="w-72 shrink-0 border-l border-gray-800">
        <EditorPanel />
      </div>
    </div>
  );
}

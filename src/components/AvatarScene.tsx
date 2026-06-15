import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { VRMAvatar } from './VRMAvatar'
import { SceneLights } from './SceneLights'
import { GradingEffects } from './GradingEffects'

interface AvatarSceneProps {
  avatarUrl: string
}

function FallbackBox() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  )
}

export function AvatarScene({ avatarUrl }: AvatarSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 2.5], fov: 35 }}
      shadows
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#1a1a2e']} />

      <SceneLights castShadow />

      <Suspense fallback={<FallbackBox />}>
        {avatarUrl ? (
          <VRMAvatar key={avatarUrl} url={avatarUrl} />
        ) : (
          <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color="#6366f1" />
          </mesh>
        )}

        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.4}
          scale={4}
          blur={2}
        />
      </Suspense>

      {/* zoomToCursor: 스크롤 줌 시 커서 밑 지점이 화면에 머물도록 카메라+target 이동
          → 얼굴에 커서 두고 줌인하면 얼굴 쪽으로. raycast 불필요(커서 광선 기준)라 전 모델 호환 */}
      <OrbitControls
        target={[0, 1.0, 0]}
        minDistance={0.5}
        maxDistance={6}
        enablePan
        zoomToCursor
      />

      {/* 톤 컬러 그레이딩 — 화면 레이어 (모델 비퇴행). 디폴트 0이면 무변화 */}
      <GradingEffects />
    </Canvas>
  )
}

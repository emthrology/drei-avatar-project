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

      <OrbitControls
        target={[0, 1.0, 0]}
        minDistance={0.5}
        maxDistance={6}
        enablePan={false}
      />

      {/* 톤 컬러 그레이딩 — 화면 레이어 (모델 비퇴행). 디폴트 0이면 무변화 */}
      <GradingEffects />
    </Canvas>
  )
}

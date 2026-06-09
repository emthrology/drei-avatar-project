import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { VRMAvatar } from './VRMAvatar'

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

function Lights() {
  return (
    <>
      {/* MToonMaterial은 환경맵 무시 — 명시적 조명 필요 */}
      <ambientLight intensity={0.6} />
      {/* 정면 메인 조명 */}
      <directionalLight
        position={[0.5, 2, 2]}
        intensity={2.0}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* 백라이트 (림라이트 보조) */}
      <directionalLight position={[-1, 1, -2]} intensity={0.4} />
    </>
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

      <Lights />

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
    </Canvas>
  )
}

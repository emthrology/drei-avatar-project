import { useAvatarStore } from '../store'

// 에디터·컴패니언 공유 조명 — store.lighting 단일 소스. 어느 쪽에서 조절해도 양쪽 반영.
// MToonMaterial은 환경맵 무시 → 명시적 ambient+directional 필수.

// 메인광 수평반경/높이 — 방위각(keyAngle)으로 position 산출. 디폴트 14°에서 [0.5,2,2] 재현
const KEY_RADIUS = 2.06
const KEY_HEIGHT = 2.0

interface SceneLightsProps {
  castShadow?: boolean // 에디터만 그림자 사용 (컴패니언 Canvas는 shadows 미설정)
}

export function SceneLights({ castShadow = false }: SceneLightsProps) {
  const { lighting } = useAvatarStore()
  const rad = (lighting.keyAngle * Math.PI) / 180
  const keyPos: [number, number, number] = [
    Math.sin(rad) * KEY_RADIUS,
    KEY_HEIGHT,
    Math.cos(rad) * KEY_RADIUS,
  ]
  return (
    <>
      <ambientLight intensity={lighting.ambient} />
      {/* 메인 조명 — 방위각으로 회전 (측면으로 돌리면 그늘 생성) */}
      <directionalLight
        position={keyPos}
        intensity={lighting.keyIntensity}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
      />
      {/* 백라이트 (림라이트 보조) — 고정 */}
      <directionalLight position={[-1, 1, -2]} intensity={0.4} />
    </>
  )
}

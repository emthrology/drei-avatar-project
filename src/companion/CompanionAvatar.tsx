import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { VRMLoaderPlugin, VRM, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'
import { useLipsync } from './useLipsync'
import { useIdleAnimation } from './useIdleAnimation'
import { type SpeakPayload } from './tts'

export interface CameraSettings {
  position: [number, number, number]
  target: [number, number, number]
}

interface Props {
  url: string
  onReady: (speak: (payload: SpeakPayload) => void) => void
  onCameraReady?: (s: CameraSettings) => void
}

function computeUpperBodyCamera(vrm: VRM): CameraSettings {
  vrm.scene.updateWorldMatrix(true, true)

  const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
  const hipsBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips)

  const headPos = new THREE.Vector3()
  const hipsPos = new THREE.Vector3()
  headBone?.getWorldPosition(headPos)
  hipsBone?.getWorldPosition(hipsPos)

  // 본이 없거나 origin에 있으면 표준 VRM 신장으로 fallback
  if (headPos.y < 0.1) headPos.y = 1.6
  if (hipsPos.y < 0.1) hipsPos.y = 0.95

  const torsoHeight = headPos.y - hipsPos.y  // hips → head 본 거리

  // Head 본은 두개골 하단 — 머리카락 끝까지 torso의 약 30% 추가 확보
  const spanTop = headPos.y + torsoHeight * 0.3
  const spanBot = hipsPos.y + torsoHeight * 0.15
  const targetY = (spanTop + spanBot) / 2
  const verticalSpan = spanTop - spanBot

  // fov=28 기준으로 수직 범위가 딱 맞는 거리 계산 (10% 여백)
  const fov = 28
  const dist = (verticalSpan / 2) / Math.tan(((fov * Math.PI) / 180) / 2) * 1.1

  return {
    target: [0, targetY, 0],
    position: [0, targetY, dist],
  }
}

export function CompanionAvatar({ url, onReady, onCameraReady }: Props) {
  const vrmRef = useRef<VRM | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf = useGLTF(url, true, true, (loader: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.register((parser: any) => new VRMLoaderPlugin(parser as any))
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrm: VRM | undefined = (gltf as any).userData?.vrm

  const { speak } = useLipsync(vrmRef)
  useIdleAnimation(vrmRef)

  useEffect(() => {
    if (!vrm) return
    VRMUtils.rotateVRM0(vrm)
    vrmRef.current = vrm
    onReady(speak)
    onCameraReady?.(computeUpperBodyCamera(vrm))
    return () => { VRMUtils.deepDispose(vrm.scene) }
  }, [vrm, onReady, speak, onCameraReady])

  useFrame((_, delta) => {
    vrmRef.current?.update(delta)
  })

  if (!vrm) return null
  return <primitive object={vrm.scene} />
}

import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm'
import { useLipsync } from './useLipsync'
import { useIdleAnimation } from './useIdleAnimation'
import { type SpeakPayload } from './tts'

interface Props {
  url: string
  onReady: (speak: (payload: SpeakPayload) => void) => void
}

export function CompanionAvatar({ url, onReady }: Props) {
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
    return () => { VRMUtils.deepDispose(vrm.scene) }
  }, [vrm, onReady, speak])

  useFrame((_, delta) => {
    vrmRef.current?.update(delta)
  })

  if (!vrm) return null
  return <primitive object={vrm.scene} />
}

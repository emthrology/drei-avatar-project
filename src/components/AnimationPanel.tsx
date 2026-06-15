import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// VRM + AnimationMixer를 공유하기 위한 싱글톤
interface AnimState {
  mixer: THREE.AnimationMixer | null
  clips: THREE.AnimationClip[]
  scene: THREE.Object3D | null
}
const _anim: AnimState = { mixer: null, clips: [], scene: null }

export function setAnimScene(scene: THREE.Object3D | null, clips: THREE.AnimationClip[]) {
  _anim.scene = scene
  _anim.clips = clips
  if (scene) {
    _anim.mixer = new THREE.AnimationMixer(scene)
  } else {
    _anim.mixer?.stopAllAction()
    _anim.mixer = null
  }
}

// useFrame에서 호출할 mixer updater
export function updateAnimMixer(delta: number) {
  _anim.mixer?.update(delta)
}

export function AnimationPanel() {
  const [clips, setClips] = useState<string[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  // 씬 변경 감지 (폴링 대신 간단하게 1초마다 확인)
  useEffect(() => {
    const id = setInterval(() => {
      setClips(_anim.clips.map((c) => c.name))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  function play(name: string) {
    if (!_anim.mixer) return
    actionRef.current?.stop()
    const clip = _anim.clips.find((c) => c.name === name)
    if (!clip) return
    const action = _anim.mixer.clipAction(clip)
    action.reset().fadeIn(0.3).play()
    actionRef.current = action
    setPlaying(name)
  }

  function stop() {
    actionRef.current?.fadeOut(0.3)
    actionRef.current = null
    setPlaying(null)
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {clips.length === 0 ? (
        <p className="text-xs text-gray-600">
          이 VRM에 내장 애니메이션 없음
          <br />
          <span className="text-gray-700">(외부 .bvh / .fbx 적용은 Phase 4+ 예정)</span>
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {clips.map((name) => (
            <button
              key={name}
              onClick={() => (playing === name ? stop() : play(name))}
              className={`py-1.5 px-3 rounded text-xs text-left transition-colors ${
                playing === name
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {playing === name ? '⏹ ' : '▶ '}{name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

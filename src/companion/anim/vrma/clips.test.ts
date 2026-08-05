import { describe, it, expect } from 'vitest'
import { filterTracks, VRMA_WAVE } from './clips'

// filterTracks 가 틀리면 재생 중 아바타가 프레임 밖으로 나간다(hips 이동이 살아남아서).
// 순수 함수로 떼어낸 이유이자, 트랙 이름 형식(`<노드>.<property>`) 파싱을 고정해두는 목적.

const T = (name: string) => ({ name })

describe('filterTracks', () => {
  it('제거 off 면 전부 통과', () => {
    const tracks = [T('Hips.position'), T('Hips.quaternion')]
    expect(filterTracks(tracks, false)).toHaveLength(2)
  })

  it('position 트랙만 제거하고 회전은 남긴다', () => {
    const tracks = [
      T('Normalized_J_Bip_C_Hips.position'),
      T('Normalized_J_Bip_C_Hips.quaternion'),
      T('Normalized_J_Bip_C_Head.quaternion'),
    ]
    const kept = filterTracks(tracks, true).map((t) => t.name)
    expect(kept).toEqual([
      'Normalized_J_Bip_C_Hips.quaternion',
      'Normalized_J_Bip_C_Head.quaternion',
    ])
  })

  it('노드명에 점이 있어도 마지막 점 기준으로 property 를 읽는다', () => {
    expect(filterTracks([T('rig.spine.02.position')], true)).toHaveLength(0)
    expect(filterTracks([T('rig.spine.02.quaternion')], true)).toHaveLength(1)
  })

  it('property 가 없는 이름은 남긴다 (오분류 방지)', () => {
    expect(filterTracks([T('position')], true)).toHaveLength(1)
  })

  it('원본 배열을 변형하지 않는다', () => {
    const tracks = [T('A.position'), T('B.quaternion')]
    expect(filterTracks(tracks, true)).toHaveLength(1)
    expect(tracks).toHaveLength(2)
  })
})

describe('VRMA_WAVE 정의', () => {
  // 우리가 개조해 만든 파일(scripts/makeWaveVrma.mjs). 원본 7종을 직접 가리키면 안 된다 —
  // VRMA_02 는 앞 구간이 "앉았다 일어서기"라 오버레이에서 몸이 솟는다.
  it('개조 산출물(wave.vrma)을 쓴다', () => {
    expect(VRMA_WAVE.url).toBe('/animations/wave.vrma')
  })

  it('자세가 안정된 구간만 트림해 쓴다', () => {
    expect(VRMA_WAVE.from).toBeGreaterThanOrEqual(2.5)
    expect(VRMA_WAVE.to).toBeGreaterThan(VRMA_WAVE.from!)
    expect(VRMA_WAVE.to! - VRMA_WAVE.from!).toBeLessThanOrEqual(4) // 인사가 늘어지지 않게
  })

  // hips 이동이 살아있으면 고정 상반신 프레이밍을 벗어난다(실측). 기본값이 제거임을 고정.
  it('hips 이동을 제거한다(기본값)', () => {
    expect(VRMA_WAVE.keepHipsPosition).toBeFalsy()
  })

  // 복귀 블렌드가 0이면 VRMA 마지막 자세에서 idle 로 튄다.
  it('진입·복귀 블렌드 구간을 가진다', () => {
    expect(VRMA_WAVE.fadeIn).toBeGreaterThan(0)
    expect(VRMA_WAVE.fadeOut).toBeGreaterThan(0)
  })
})

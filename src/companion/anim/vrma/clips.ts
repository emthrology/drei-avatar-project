// VRMA 클립 카탈로그
//
// ⚠️ **부분 추출은 하지 않는다 (실측으로 반려).** VRMA 모션은 전신이 함께 움직인다는 전제로
// 저작돼 있어서, 부위를 떼어 쓰면 남은 부위와 균형이 깨져 오히려 더 어색해진다.
// (VRMA_02 실측: hips 앞숙임 +19~30° 와 head 젖힘 −16~−25° 가 짝. 전신을 다 가져오면 상쇄되지만
//  hips 만 가져오면 몸이 앞으로 숙고, head 만 가져오면 고개가 뒤로 젖혀진다. 부위 마스킹·상대
//  모드·가중치 축소를 모두 시도했고 전부 더 나빴다 — 상세 docs/vrma-adoption.md)
//
// → 대신 **전신을 통째로 쓰되 가장 정적인 클립을 고른다.** 7종 실측에서 VRMA_03(브이사인)이 최소
//   (hipsY 0.023m · 수평 0.067m · hips 81° · torso 67°). 이걸 개조한 게 wave.vrma 다.
//
// 표정·시선은 마스킹조차 불필요 — 공식 7종에 expression·lookAt 채널이 아예 없다(실측).
// 그래서 무드·립싱크·사케이드가 VRMA 재생 중에도 그대로 산다. 우리가 만들 .vrma 도 이 성질을
// 유지해야 한다(표정을 파일에 굽지 말 것 — 무드는 런타임 상태다).

export interface VrmaClipDef {
  id: string;
  label: string;
  url: string;
  /** 구간 트림(초). 공식 7종은 전신 쇼케이스라 쓸 구간이 일부다 */
  from?: number;
  to?: number;
  /** 진입/복귀 블렌드(ms) — 복귀 블렌드가 "동작 후 idle 로 돌아오기"를 담당 */
  fadeIn?: number;
  fadeOut?: number;
  /**
   * hips 이동 트랙 유지(기본 false = 제거). 7종은 전신 카메라를 전제로 저작돼 몸이 최대
   * 0.34m 이동/0.63m 상하하는데, 컴패니언은 로드 시 1회 산출한 고정 상반신 프레이밍이라
   * 그대로 재생하면 프레임을 벗어난다(실측). 회전은 그대로 둔다 — 전신 일관성이 깨지므로.
   */
  keepHipsPosition?: boolean;
  /**
   * 재생 동안 함께 걸 무드(표정). 재생 시작에 적용하고 끝나면 `moodAfter` 로 되돌린다.
   *
   * **본이 아니라 표정 레이어라서 합성이 성립한다** — 공식 7종에도 우리 wave.vrma 에도
   * expression 트랙이 아예 없어서(파일 상단 참조) mixer 가 표정을 안 건드린다. 그래서 무드의
   * held 표정·일회성 눈웃음이 클립 재생 중에도 그대로 산다. 반대로 본은 mixer 가 통째로
   * 덮어쓰므로, 무드의 **루프 톤**(호흡·머리 템포)은 재생 중엔 안 보이고 복귀 후에 반영된다.
   */
  mood?: string;
  /** 재생 종료 후 되돌릴 무드 (기본 neutral) */
  moodAfter?: string;
}

/**
 * hips 이동 트랙 제거 — 순수 함수(테스트 대상). 트랙 이름 형식은 `<노드명>.<property>`.
 * 여기가 틀리면 아바타가 재생 중 프레임 밖으로 나간다.
 */
export function filterTracks<T extends { name: string }>(
  tracks: readonly T[],
  dropPosition: boolean,
): T[] {
  if (!dropPosition) return [...tracks];
  return tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.');
    return (dot < 0 ? '' : t.name.slice(dot + 1)) !== 'position';
  });
}

// ─── 카탈로그 ────────────────────────────────────────────────────────────────

/**
 * 손인사 — `wave.vrma`. VRMA_03(브이사인)을 [scripts/makeWaveVrma.mjs](../../../../scripts/makeWaveVrma.mjs)
 * 로 개조한 우리 저작물이다(손가락→편 손 이식, 손목→좌우 흔들기 주입). 재생성 가능하지만
 * 산출물을 커밋한다(썸네일과 같은 취급 — 빌드 서버에서 재생성하지 않는다).
 *
 * 트림 구간은 팔이 올라와 자세가 안정된 뒤(2.9s~). 팔을 드는 전환은 클립이 아니라 우리
 * fadeIn 블렌드가 만든다 — idle 팔 자세에서 출발하므로 그쪽이 더 매끄럽다.
 */
export const VRMA_WAVE: VrmaClipDef = {
  id: 'wave',
  label: '손인사(VRMA)',
  url: '/animations/wave.vrma',
  from: 2.9,
  to: 5.9,
  fadeIn: 400,
  fadeOut: 500,
};

/**
 * 인사 — 손인사(본) + happy(표정) 합성. **컴패니언 진입 시 1회** 재생된다(useVrmaLayer greetOnReady).
 *
 * 새 `.vrma` 파일이 아니다 — 같은 클립에 무드를 얹은 **구성**이다. 레이어가 분리돼 있어서
 * (본=VRMA / 표정=무드 시스템) 파일을 새로 저작하지 않고 조합만으로 만들어진다.
 * 표정을 `.vrma` 에 굽지 않는다는 원칙(파일 상단)의 실익이 여기서 나온다 — 구우면 무드별로
 * 파일이 하나씩 필요해진다.
 *
 * 무표정으로 손만 흔드는 것보다 인사답고, `happy` 진입의 일회성 눈웃음(HAPPY_EYE)이 클립
 * 길이(3s)와 맞물려 "웃으며 손 흔들고 → 평상시 표정으로" 가 한 번에 끝난다.
 */
export const VRMA_GREET: VrmaClipDef = {
  ...VRMA_WAVE,
  id: 'greet',
  label: '인사(손+미소)',
  mood: 'happy',
};

export const VRMA_CLIPS: Record<string, VrmaClipDef> = {
  [VRMA_WAVE.id]: VRMA_WAVE,
  [VRMA_GREET.id]: VRMA_GREET,
};

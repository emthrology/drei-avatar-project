// 무드별 애니메이션 템플릿. 현재는 neutral만 — 8무드 확장은 C/E 단계 영역.
//
// 각 템플릿은 루프 클립으로 큐에 등록되며, 완료 시 gaussian 재롤되어 무한 반복.
// idle/speaking 서브키로 발화 중 더 큰 머리 움직임 등 분기.

import type { AnimTemplate, Ranged, ChannelValues } from './scheduler';

// 호흡: 1.5초 지연 후 들숨(1.2s)→유지(0.5s)→날숨(1.0s) 반복
const breathing: AnimTemplate = {
  name: 'breathing',
  loop: true,
  delay: 1500,
  dt: [1200, 500, 1000],
  vs: { 'chest.inhale': [0.5, 0.5, 0] },
};

// 머리 미동: idle은 대부분 작은 미동, 가끔 크게 둘러보기(살아있는 느낌). speaking은 빈번.
const head: AnimTemplate = {
  name: 'head',
  loop: true,
  idle: {
    name: 'head',
    alt: [
      // 일상 미동 (대부분) — 기존보다 살짝 큼
      {
        name: 'head',
        p: 0.7,
        delay: [0, 400],
        dt: [[800, 2600]],
        vs: {
          'head.rotateX': [[-0.03, 0.05]],
          'head.rotateY': [[-0.09, 0.09]],
          'head.rotateZ': [[-0.04, 0.04]],
        },
      },
      // 가끔 크게 둘러보기 — 머리를 확 돌렸다 hold-last로 잠시 유지
      {
        name: 'head',
        delay: [300, 800],
        dt: [[700, 1500]],
        vs: {
          'head.rotateY': [[-0.22, 0.22]],
          'head.rotateZ': [[-0.07, 0.07]],
          'head.rotateX': [[-0.04, 0.06]],
        },
      },
    ],
  },
  speaking: {
    name: 'head',
    dt: [[300, 1200]],
    vs: {
      'head.rotateX': [[-0.03, 0.06]],
      'head.rotateY': [[-0.08, 0.08]],
      'head.rotateZ': [[-0.05, 0.05]],
    },
  },
};

// 크게 비틀어 둘러보기 (좌/우) — Spine 큰 턴, 머리는 FK 상속. pose 루프 alt로 등장(p 0.3씩)
// + 디버그 트리거용으로 export(IDLE_POSES에 합류). 값 단일 소스라 루프/디버그가 동일 정의 공유.
export const IDLE_SPINE_POSES: AnimTemplate[] = [
  {
    name: 'pose',
    label: '둘러보기L',
    p: 0.3,
    delay: [1000, 2300],
    dt: [[1300, 2000]],
    vs: { 'spine.x': [0.02], 'spine.y': [0.35], 'spine.z': [-0.05] },
  },
  {
    name: 'pose',
    label: '둘러보기R',
    p: 0.3,
    delay: [1000, 2300],
    dt: [[1300, 2000]],
    vs: { 'spine.x': [0.02], 'spine.y': [-0.35], 'spine.z': [0.05] },
  },
];

// 포즈: 6종 상반신 체중이동을 랜덤 전환. Spine 회전(Head/팔/Chest는 FK 상속 → 전신 흔들림).
// 기존보다 진폭 크고 다양하며 더 자주 전환(~2~6초) → 적극적인 idle. dt=전환 이징(gaussian).
// delay만 축소(주기↓), dt(전환 부드러움)·진폭은 유지.
const pose: AnimTemplate = {
  name: 'pose',
  loop: true,
  alt: [
    {
      name: 'pose',
      delay: [1300, 3200],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [0.0], 'spine.y': [0.06], 'spine.z': [0.05] },
    },
    {
      name: 'pose',
      delay: [1300, 3200],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [0.03], 'spine.y': [-0.08], 'spine.z': [-0.06] },
    },
    {
      name: 'pose',
      delay: [1300, 3200],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [-0.02], 'spine.y': [0.1], 'spine.z': [0.04] },
    },
    {
      name: 'pose',
      delay: [1300, 2900],
      dt: [[1200, 2200]],
      vs: { 'spine.x': [0.05], 'spine.y': [0.0], 'spine.z': [-0.03] },
    },
    {
      name: 'pose',
      delay: [1000, 2600],
      dt: [[1000, 1800]],
      vs: { 'spine.x': [0.0], 'spine.y': [0.13], 'spine.z': [-0.04] },
    },
    {
      name: 'pose',
      delay: [1000, 2600],
      dt: [[1000, 1800]],
      vs: { 'spine.x': [0.01], 'spine.y': [-0.12], 'spine.z': [0.06] },
    },
    // 크게 비틀어 둘러보기 (좌/우) — 위 IDLE_SPINE_POSES 참조 (루프/디버그 단일 소스)
    ...IDLE_SPINE_POSES,
  ],
};

// 눈깜빡임: 85% 단일 깜빡임, 15% 이중 깜빡임. delay 재롤로 2~8초 랜덤 간격
const blink: AnimTemplate = {
  name: 'blink',
  loop: true,
  alt: [
    {
      name: 'blink',
      p: 0.85,
      delay: [2000, 8000, 1, 2],
      dt: [50, [100, 200], 100],
      vs: { blink: [1, 1, 0] },
    },
    {
      name: 'blink',
      delay: [2000, 5000, 1, 2],
      dt: [50, [100, 150], 100, [10, 300, 0], 50, [100, 150], 100],
      vs: { blink: [1, 1, 0, 0, 1, 1, 0] },
    },
  ],
};

// ── idle 팔 포즈 (FK) ──────────────────────────────────────
// 차렷 고정이던 팔에 생활감 부여. armPose 루프가 idle 중 랜덤 전환(차렷 55% + 변형 자세 45%:
// 허리짚기·뒷짐·앞으로모으기). 발화 중(speaking)엔 rest로 양보 → 제스처가 팔 채널 소유.
// 손끝 정밀도는 작은 오버레이서 안 보여 FK 근사로 충분(손가슴과 동일). 검증축: arm.z(들기),
// arm.x(±=앞뒤, 음수=앞), elbow.z(굽힘 좌− / 우+). 각 포즈는 양팔 전 채널 명시(잔상 방지).
//
// 디버그 버튼용으로 export — DebugPanel이 label로 트리거(companion:idlepose).
export const IDLE_ARM_POSES: AnimTemplate[] = [
  {
    name: 'armPose',
    label: '허리짚기L',
    p: 0.05, // 빈도 낮춤 (가끔만)
    ease: 2.8,
    delay: [1700, 3600],
    dt: [[800, 1300]],
    vs: {
      'armL.z': [-1.02],
      'armL.x': [-0.12],
      'elbowL.z': [-1.05],
      'armR.z': [1.3],
      'armR.x': [0],
      'elbowR.z': [0],
    },
  },
  {
    name: 'armPose',
    label: '허리짚기R',
    p: 0.05, // 빈도 낮춤 (가끔만)
    ease: 2.8,
    delay: [1700, 3600],
    dt: [[800, 1300]],
    vs: {
      'armR.z': [1.02],
      'armR.x': [-0.12],
      'elbowR.z': [1.05],
      'armL.z': [-1.3],
      'armL.x': [0],
      'elbowL.z': [0],
    },
  },
  {
    name: 'armPose',
    label: '뒷짐',
    p: 0.15,
    ease: 2.8,
    delay: [1900, 3900],
    dt: [[900, 1400]],
    vs: {
      'armL.x': [0.26],
      'armR.x': [0.26],
      'elbowL.z': [-0.5],
      'elbowR.z': [0.5],
      'armL.z': [-1.28],
      'armR.z': [1.28],
    },
  },
  // ── 비대칭/변형 안정 자세 (차렷 탈피) ──────────────────────
  // 앞으로모으기: 양손을 몸 앞 하단(≈허리 높이)에 느슨히 모아 맞잡은 자세. 사회자·안내원이
  // 공손히 서 있을 때처럼. 양 상완을 앞으로 조금(x−) + 팔꿈치 중간 굽힘(z ∓0.7 ≈40°)으로
  // 양손이 몸 중앙 앞에서 만남. 몸을 가로지르지 않아(팔짱/한손잡기와 달리) 클리핑 적음.
  {
    name: 'armPose',
    label: '앞으로모으기',
    // p 생략 → 나머지 확률 흡수 (pickAlt 마지막)
    ease: 2.8,
    delay: [2000, 4200],
    dt: [[1000, 1600]],
    vs: {
      'armL.z': [-1.2],
      'armL.x': [-0.28],
      'elbowL.z': [-0.7],
      'armR.z': [1.2],
      'armR.x': [-0.28],
      'elbowR.z': [0.7],
    },
  },
];

// 디버그 idle 포즈 트리거 목록 (팔 포즈 + 몸통 둘러보기). useAnimator/DebugPanel이 인덱스 공유.
// 팔=armPose 루프, 몸통=pose 루프 소속이라 주입 시 각자 소속 루프를 per-channel 후순위로 눌러 이김.
export const IDLE_POSES: AnimTemplate[] = [
  ...IDLE_ARM_POSES,
  ...IDLE_SPINE_POSES,
];

// 차렷+미세 무게이동 (높은 확률, 길게 유지) — armL/R.z 작은 범위로 상시 미동
//
// ⚠️ 여기만 **균등분포**(`samples=1`)를 쓴다. 기본값(5회 평균)은 구간 중앙에 몰려서, 폭이
// 0.06~0.10rad 여도 **연속 두 롤의 실제 간격은 그 14.6% = 0.5~0.84°** 뿐이다 → dt 1.8s 에 걸치면
// 0.28~0.47°/s 로 인지 문턱(0.5°/s) 바로 아래에 깔린다. 팔이 '움직이는 중인데 멈춰 보이는' 상태가
// 20초씩 이어진 원인(motionProfile 의 WORST_STILL). 균등분포는 같은 간격이 33.4% 로 **2.28배**가
// 되어 문턱을 넘는다 — **구간 폭은 그대로라 자세가 더 벌어지지 않는다**(진폭이 아니라 분포를 고침).
// (`gaussianRandom` 의 samples=1 = 균등분포. 이 값을 되돌리면 위 증상이 재발한다)
const armRelaxed: AnimTemplate = {
  name: 'armPose',
  // 차렷 55% (지배 완화 — 나머지 45%: 허리짚기L/R 0.05, 뒷짐 0.15, 앞으로모으기 잔여 0.2).
  p: 0.55,
  ease: 3,
  delay: [1200, 2600],
  dt: [[1400, 2200]],
  vs: {
    'armL.z': [[-1.33, -1.27, 1, 1]],
    'armR.z': [[1.27, 1.33, 1, 1]],
    'armL.x': [[-0.03, 0.03, 1, 1]],
    'armR.x': [[-0.03, 0.03, 1, 1]],
    'elbowL.z': [[-0.08, 0.02, 1, 1]],
    'elbowR.z': [[-0.02, 0.08, 1, 1]],
  },
};

// armPose 루프: idle은 차렷/포즈 랜덤 전환, speaking은 rest(제스처에 팔 양보)
const armPose: AnimTemplate = {
  name: 'armPose',
  loop: true,
  idle: {
    name: 'armPose',
    alt: [armRelaxed, ...IDLE_ARM_POSES],
  },
  speaking: {
    name: 'armPose',
    ease: 3,
    delay: [1500, 3000],
    dt: [[600, 1000]],
    vs: {
      'armL.z': [-1.3],
      'armR.z': [1.3],
      'armL.x': [0],
      'armR.x': [0],
      'elbowL.z': [0],
      'elbowR.z': [0],
    },
  },
};

// 제스처 세트: 발화 시작 시 1개 랜덤 발동(루프 아님). 각 제스처는 독립 템플릿.
//
// 구조: vs = [out, hold, rest]. 빠르게 동작(out) → 잠깐 머묾(hold) → 천천히 복귀(rest).
//   비대칭 타이밍(out < back) + dt gaussian 범위 → 매번 미묘히 달라져 기계적이지 않음.
//   factory가 선두 null(=live) 자동 추가 → live에서 out으로, rest로 복귀. ease=2.5 완만.
//
// 결을 다변화 — 팔 주도 / 머리 주도(끄덕·갸웃) / 다가서기·물러서기 / 몸통 기울임 / 손가슴.
// 검증된 축: armL/R.z(들기), armL.x(−=앞), elbow.z(굽힘), head.gx(+=숙임),
//   head.gz(+=기울임), chest.leanX(+=앞), chest.turnY/leanZ(몸통 턴/린).
// ⚠️ 임시 — 손인사 '정지 자세' 탐색. 확정 후 제거할 것.
//
// 왜 랜덤 탐색인가: armR 의 euler 순서(XYZ)상 롤(y)이 들기(z) 축을 같이 돌려서, 한 축씩
// 손으로 굴리면 "벌렸는데 손이 내려간다" 같은 역전이 계속 난다. 팔은 흔드는 동안 **정지**라
// 자세와 흔들기를 분리해 풀 수 있다 → 자세만 먼저 다변량 탐색으로 찾는다.
// 흔들기(handR)는 자세 확정 후 별도로 잡는다(축 매핑이 자세 종속이므로 순서가 중요).
//
// LCG 시드 고정 = 재현 가능. 라벨에 파라미터를 실어 당첨 조합을 바로 읽는다.
// ⚠️ 실측 교훈: `armR.y`(상완 롤)를 켜면 `armR.z`(들기)가 무력화된다(손높이 상관 0.86→0.07).
// euler XYZ 에서 롤이 들기 축을 같이 돌리기 때문. → **롤은 0으로 두고 들기로 높이를 번다.**
// 손인사는 팔을 옆으로 **벌리는**(armR.z 외전) 게 아니라 상완을 몸 **앞으로 조금 드는**
// 어깨 굴곡(armR.x 음수)이다. 상완은 몸통 옆에 내린 채 두고 팔꿈치로 하완을 세운다.
// 하완은 단순 상승이 아니라 **바깥으로 돌면서** 올라와야 몸통을 안 스치고 손바닥도 바깥을 본다.
// 그 회전이 어깨 외회전(armR.y) + 하완 회외(elbowR.y). 상완은 내린 채 앞으로만 조금(armR.x).
// 자세 확정 후 **그 자세에서** 손목 축을 다시 잰다 (매핑이 자세 종속 — 이전 결과 재사용 금지)
const GESTURES: AnimTemplate[] = [
  // ── 팔 주도 ──────────────────────────────────────────
  {
    name: 'gesture',
    label: '왼손짓',
    ease: 2.5,
    dt: [
      [300, 420],
      [250, 450],
      [550, 750],
    ],
    vs: {
      'armL.z': [-1.15, -1.15, -1.3],
      'elbowL.z': [-0.3, -0.3, 0],
      'chest.turnY': [0.07, 0.07, 0],
      'chest.leanZ': [-0.04, -0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '오른손짓',
    ease: 2.5,
    dt: [
      [300, 420],
      [250, 450],
      [550, 750],
    ],
    vs: {
      'armR.z': [1.15, 1.15, 1.3],
      'elbowR.z': [0.3, 0.3, 0],
      'chest.turnY': [-0.07, -0.07, 0],
      'chest.leanZ': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '양손 펼침',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 500],
      [600, 800],
    ],
    vs: {
      'armL.z': [-1.18, -1.18, -1.3],
      'armR.z': [1.18, 1.18, 1.3],
      'elbowL.z': [-0.22, -0.22, 0],
      'elbowR.z': [0.22, 0.22, 0],
      'chest.turnY': [0.04, 0.04, 0],
    },
  },
  // ── 머리 주도 (head.g* — idle 미동 위에 합성) ──────────
  {
    name: 'gesture',
    label: '끄덕',
    ease: 2.5,
    dt: [
      [200, 280],
      [150, 300],
      [400, 550],
    ],
    vs: {
      'head.gx': [0.14, 0.14, 0],
      'chest.leanX': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '갸웃',
    ease: 2.5,
    dt: [
      [400, 550],
      [800, 1200],
      [550, 750],
    ],
    vs: {
      'head.gz': [0.3, 0.3, 0],
    },
  },
  // ── 다가서기 / 물러서기 (chest.leanX 앞뒤) ─────────────
  {
    name: 'gesture',
    label: '다가서기',
    ease: 2.5,
    dt: [
      [350, 480],
      [400, 700],
      [600, 800],
    ],
    vs: {
      'chest.leanX': [0.1, 0.1, 0],
      'head.gx': [0.05, 0.05, 0],
      'armL.z': [-1.2, -1.2, -1.3],
      'armR.z': [1.2, 1.2, 1.3],
      'elbowL.z': [-0.18, -0.18, 0],
      'elbowR.z': [0.18, 0.18, 0],
    },
  },
  {
    name: 'gesture',
    label: '물러서기',
    ease: 2.5,
    dt: [
      [250, 350],
      [300, 550],
      [550, 750],
    ],
    vs: {
      'chest.leanX': [-0.09, -0.09, 0],
      'head.gx': [-0.07, -0.07, 0],
    },
  },
  // ── 몸통 기울임 (기울여 강조, 팔 보조) ────────────────
  {
    name: 'gesture',
    label: '왼기울임',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 550],
      [600, 820],
    ],
    vs: {
      'chest.turnY': [0.1, 0.1, 0],
      'chest.leanZ': [-0.07, -0.07, 0],
      'armL.z': [-1.22, -1.22, -1.3],
      'elbowL.z': [-0.18, -0.18, 0],
    },
  },
  {
    name: 'gesture',
    label: '오른기울임',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 550],
      [600, 820],
    ],
    vs: {
      'chest.turnY': [-0.1, -0.1, 0],
      'chest.leanZ': [0.07, 0.07, 0],
      'armR.z': [1.22, 1.22, 1.3],
      'elbowR.z': [0.18, 0.18, 0],
    },
  },
  // ── 손을 가슴에 (진심 — 한 손 가슴쪽 + 고개 기울임) ────
  // 손가슴 = 팔을 앞으로(armL.x 음수=앞) + 팔꿈치 크게 굽혀 손을 가슴 중앙으로
  {
    name: 'gesture',
    label: '손가슴',
    ease: 2.5,
    dt: [
      [400, 550],
      [600, 1000],
      [650, 850],
    ],
    vs: {
      'armL.z': [-1.15, -1.15, -1.3],
      'armL.x': [-0.55, -0.55, 0],
      'elbowL.z': [-1.6, -1.7, 0],
      'head.gz': [0.12, 0.12, 0],
    },
  },
];

// 손인사(안녕 wave) — 재개(2026-08-04). 팔은 자세만 잡고 **좌우 흔들기는 손목 전담**.
//
// 이전 5회 실패(docs/wave-gesture-attempts.md)는 상완/팔꿈치만으로 "하완 앞 배치 + 좌우 흔들기 +
// 상완 정지"를 동시에 만족시키려다 난 커플링이었다. 손목을 쓰면 세 조건이 서로 다른 본에 분리된다.
//
// ⚠️ 손목 축→월드 방향 매핑은 **팔 자세에 종속**이다(부모 회전이 손 로컬축을 같이 돌림).
//    아래 armR/elbowR 값을 바꾸면 handR 축을 처음부터 다시 재야 한다 — 추측 금지.
//    실제로 자세를 바꿀 때마다 좌우였던 축이 앞뒤/세로로 돌아갔다(스윕 기록: 아래 표).
//
// 목표 자세는 참고 이미지 기준: **상완은 내린 채 몸통 옆, 팔꿈치를 깊게 접어 하완을 세우고,
// 손은 얼굴 옆.** (팔 전체를 들어올리는 형태가 아니다 — 그건 지표는 통과해도 인사로 안 보였다.)
//
// 하완은 **단순 상승이 아니라 바깥으로 돌면서** 올라온다 — 안 그러면 몸통을 스치고 손등이 보인다.
// 해부학 그대로: 어깨 굴곡(앞으로) + 어깨 외회전 + 팔꿈치 굴곡 + 하완 회외 + 손목 흔들기.
//
// 값의 근거 (전부 npm run probe 실측):
//   armR.z=1.25   상완은 내린 채. **벌리지 않는다** — 손인사는 외전이 아니라 굴곡이다
//   armR.x=-0.75  ★어깨 굴곡(몸 앞으로). 손 높이를 버는 실질 축(벌리기 armR.z는 상관 0.07로 무효)
//   armR.y=-0.8   ★어깨 외회전. 하완이 몸통을 안 스치고 바깥으로 돌며 올라오게(몸통이격 0.237)
//   elbowR.z=2.9  팔꿈치 굴곡 → 하완 세움. 손 높이를 지배(상관 0.86). 3.1 이상은 여자1서 미달
//   elbowR.y=-0.8 하완 스윙 — **twist 아님**. 하완을 앞으로 보내 자세를 만드는 위치 축
//   elbowR.twist=1.8 ★진짜 회외(뼈 길이축 롤) → 손바닥이 **정면**(palmFwd 0.95, 바깥 0.18).
//                 인사는 손바닥을 보는 사람에게 보여야 한다 — 측면(palmOut)만 키우면 손이 날로 서서 안 보임
//   handR.y ±0.3  ★좌우 흔들기 (손목 주도)
//   elbowR.x ±0.3  ★하완도 손목과 **동위상**으로 흔든다. 손목만으론 몸통 idle 회전 노이즈에
//                 묻혀 주축 판정이 런마다 뒤집혔다(좌우:앞뒤 1.3~1.9). 0.3이면 양 캐릭터 모두
//                 1.9배로 안정. 상완은 여전히 정지(0.006~0.06rad)라 '덜렁거림' 실패 모드 아님
//
// ⚠️ armR.y(롤)를 켜면 armR.z(벌리기)가 무력화된다(euler XYZ에서 롤이 들기 축을 같이 돌림).
//    자세를 바꾸면 손목 축 매핑도 같이 돌아가니 handR 값은 **자세 확정 후 다시 재야 한다**.
// ⚠️ elbowR.x/y 는 회외가 아니다 — 팔꿈치를 접은 뒤엔 하완을 '휘두른다'(실측: 손이 허리↔목으로
//    이동). 손바닥 방향은 반드시 `*.twist`(길이축 롤)로 잡을 것. 상세는 channels.ts BASELINE 주석.
export const WAVE: AnimTemplate = {
  name: 'wave',
  ease: 2.5,
  //   raise  →+   →-   →+   →-   →+   →-  lower
  dt: [
    [320, 400],
    [190, 240],
    [190, 240],
    [190, 240],
    [190, 240],
    [190, 240],
    [190, 240],
    [520, 680],
  ],
  vs: {
    // 팔은 흔드는 내내 정적 (덜렁거림 방지 — 실패 2·3의 실패 모드)
    'armR.z': [1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.3],
    'armR.x': [-0.75, -0.75, -0.75, -0.75, -0.75, -0.75, -0.75, 0],
    'armR.y': [-0.8, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8, 0],
    'elbowR.z': [2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 0],
    'elbowR.y': [-0.8, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8, 0],
    'elbowR.twist': [1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 0], // ★회외 — 손바닥이 정면(보는 사람)
    'elbowR.x': [0, 0.3, -0.3, 0.3, -0.3, 0.3, -0.3, 0], // ★하완도 같은 방향으로 함께
    'handR.y': [0, 0.3, -0.3, 0.3, -0.3, 0.3, -0.3, 0], // ★좌우 흔들기 — 손목 주도
    'head.gz': [0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0], // 친근한 고개 기울임
  },
};

// ── 무드별 제스처 톤 ─────────────────────────────────────
// neutral은 위 GESTURES 10종. 나머지 무드는 톤을 달리한 curated 세트.
//   happy=경쾌(ease↓·진폭↑·빠름) / sad=느림·처짐(ease↑·고개 숙임) /
//   surprised=빠른 움찔·물러서기 / angry=날카로움·다가섬

const HAPPY_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'happy-양손번쩍',
    ease: 1.8,
    dt: [
      [200, 300],
      [200, 350],
      [450, 600],
    ],
    vs: {
      'armL.z': [-0.95, -0.95, -1.3],
      'armR.z': [0.95, 0.95, 1.3],
      'elbowL.z': [-0.3, -0.3, 0],
      'elbowR.z': [0.3, 0.3, 0],
      'chest.leanX': [0.06, 0.06, 0],
      'head.gx': [-0.05, -0.05, 0], // 살짝 위로 (들뜬 느낌)
    },
  },
  {
    name: 'gesture',
    label: 'happy-끄덕끄덕',
    ease: 1.8,
    dt: [
      [150, 220],
      [120, 250],
      [350, 480],
    ],
    vs: {
      'head.gx': [0.16, 0.16, 0],
      'chest.leanX': [0.05, 0.05, 0],
    },
  },
  {
    name: 'gesture',
    label: 'happy-손흔들기',
    ease: 1.8,
    dt: [
      [200, 300],
      [250, 400],
      [450, 600],
    ],
    vs: {
      'armR.z': [0.85, 0.85, 1.3],
      'elbowR.z': [0.5, 0.5, 0],
      'chest.turnY': [-0.06, -0.06, 0],
    },
  },
];

const SAD_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'sad-고개떨굼',
    ease: 3.5,
    dt: [
      [600, 800],
      [800, 1400],
      [800, 1100],
    ],
    vs: {
      'head.gx': [0.22, 0.22, 0], // 고개 숙임
      'chest.leanX': [-0.05, -0.05, 0],
      'chest.leanZ': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: 'sad-갸웃처짐',
    ease: 3.5,
    dt: [
      [600, 800],
      [900, 1500],
      [800, 1100],
    ],
    vs: {
      'head.gz': [0.18, 0.18, 0],
      'head.gx': [0.12, 0.12, 0],
    },
  },
];

const SURPRISED_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'surprised-움찔',
    ease: 1.5,
    dt: [
      [120, 180],
      [300, 500],
      [500, 700],
    ],
    vs: {
      'chest.leanX': [-0.1, -0.09, 0], // 뒤로 물러섬
      'head.gx': [-0.1, -0.08, 0],
      'armL.z': [-1.05, -1.1, -1.3],
      'armR.z': [1.05, 1.1, 1.3],
    },
  },
  {
    name: 'gesture',
    label: 'surprised-갸웃',
    ease: 1.6,
    dt: [
      [150, 220],
      [400, 700],
      [500, 700],
    ],
    vs: {
      'head.gz': [0.2, 0.18, 0],
      'head.gx': [-0.06, -0.06, 0],
    },
  },
];

const ANGRY_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'angry-다가섬',
    ease: 1.5,
    dt: [
      [180, 260],
      [300, 500],
      [450, 650],
    ],
    vs: {
      'chest.leanX': [0.12, 0.12, 0], // 앞으로 다가섬
      'head.gx': [0.08, 0.08, 0],
      'armL.z': [-1.1, -1.1, -1.3],
      'armR.z': [1.1, 1.1, 1.3],
      'elbowL.z': [-0.25, -0.25, 0],
      'elbowR.z': [0.25, 0.25, 0],
    },
  },
  {
    name: 'gesture',
    label: 'angry-단호',
    ease: 1.5,
    dt: [
      [150, 220],
      [200, 350],
      [400, 550],
    ],
    vs: {
      'head.gx': [0.14, 0.14, 0],
      'chest.turnY': [0.08, 0.08, 0],
      'chest.leanZ': [-0.05, -0.05, 0],
    },
  },
];

export type EmotionName = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised';
// 표정 채널 키 (emo. 접두어 제외). preset 5종 + 직접 모프 강조(눈썹/surprised 부위)
export type ExpressionKey =
  | EmotionName
  | 'browAngry'
  | 'browSorrow'
  | 'browSurprised'
  | 'eyeSurprised'
  | 'mthSurprised'
  // happy 분해: 입·눈썹(held) + 눈(eyeJoy, 일회성). preset happy(Fcl_ALL_Joy) 대체
  | 'mthJoy'
  | 'browJoy'
  | 'eyeJoy';

export interface Mood {
  expression: Partial<Record<ExpressionKey, number>>; // 무드 표정 (채널 weight)
  loops: AnimTemplate[]; // 무한 루프 클립
  gestures: AnimTemplate[]; // 발화 시작 시 1개 랜덤 발동
}

// ── 루프 톤 분기 (5단계) ─────────────────────────────────
// 호흡/머리/포즈는 무드별로 템포(전환 주기)·진폭(움직임 크기)을 스케일. armPose/blink는
// 무드 무관 공유 유지(팔은 제스처가 별도 소유, 깜빡임은 의도적으로 범위 밖).
interface LoopTone {
  tempo: number;
  amplitude: number;
} // tempo<1=빠름, amplitude=움직임 배율
const DEFAULT_TONE: LoopTone = { tempo: 1, amplitude: 1 }; // neutral/surprised/angry — 스케일 무연산
const MOOD_TONE: Record<string, LoopTone> = {
  happy: { tempo: 0.7, amplitude: 1.2 }, // 30% 빠르게 · 20% 크게 — 활발한 머리/호흡
  sad: { tempo: 1.6, amplitude: 0.55 }, // 60% 느리게 · 45% 작게 — 느린 미동
};

function scaleRanged(x: Ranged, factor: number): Ranged {
  if (!Array.isArray(x)) return x * factor;
  const [min, max, skew, samples] = x;
  return skew === undefined
    ? [min * factor, max * factor]
    : [min * factor, max * factor, skew, samples];
}

// dt/delay는 tempo로, vs(진폭)는 amplitude로 스케일. alt/idle/speaking 재귀 순회.
// tone={1,1}이면 원본을 그대로 반환 — neutral은 참조 동일성까지 유지(진짜 비퇴행).
function scaleTemplate(t: AnimTemplate, tone: LoopTone): AnimTemplate {
  if (tone.tempo === 1 && tone.amplitude === 1) return t;
  const out: AnimTemplate = { ...t };
  if (t.delay !== undefined) out.delay = scaleRanged(t.delay, tone.tempo);
  if (t.dt) out.dt = t.dt.map((d) => scaleRanged(d, tone.tempo));
  if (t.vs) {
    const vs: ChannelValues = {};
    for (const [ch, arr] of Object.entries(t.vs)) {
      vs[ch] = arr.map((v) =>
        v === null ? null : scaleRanged(v, tone.amplitude),
      );
    }
    out.vs = vs;
  }
  if (t.alt) out.alt = t.alt.map((branch) => scaleTemplate(branch, tone));
  for (const state of ['idle', 'speaking'] as const) {
    if (t[state]) out[state] = scaleTemplate(t[state] as AnimTemplate, tone);
  }
  return out;
}

// 무드 전환 시 useAnimator가 remove/재add할 톤 분기 루프 이름(단일 소스).
export const TONE_LOOP_NAMES = ['breathing', 'head', 'pose'];

function loopsForMood(moodName: string): AnimTemplate[] {
  const tone = MOOD_TONE[moodName] ?? DEFAULT_TONE;
  return [
    scaleTemplate(breathing, tone),
    scaleTemplate(head, tone),
    scaleTemplate(pose, tone),
    armPose,
    blink,
  ];
}

export const MOODS: Record<string, Mood> = {
  neutral: {
    // 팔내리기는 baseline(armL.z -1.3 / armR.z 1.3)이 담당 — hold-last로 매 프레임 유지.
    // 별도 settle 클립 불필요 (로드 시 1프레임에 대기 자세 확정)
    expression: {},
    loops: loopsForMood('neutral'),
    gestures: GESTURES,
  },
  happy: {
    // 입·눈썹 미소만 held (preset Fcl_ALL_Joy의 눈 결합 제거) → 발화 내내 눈뜸 유지.
    // 눈 웃음(eyeJoy)은 진입 시 일회성 클립(HAPPY_EYE, useAnimator)이 감았다 뜬다(surprised gasp와 동형).
    expression: { mthJoy: 0.9, browJoy: 0.6 },
    loops: loopsForMood('happy'),
    gestures: HAPPY_GESTURES,
  },
  sad: {
    // relaxed(Fcl_ALL_Fun=즐거움) 제거 — 슬픔을 약화시켰음. 눈썹 올림(Sorrow)으로 변별 강화
    expression: { sad: 0.9, browSorrow: 0.5 },
    loops: loopsForMood('sad'),
    gestures: SAD_GESTURES,
  },
  surprised: {
    // Fcl_ALL_Surprised(입 크게 벌림) 대신 부위 조합 — 발화 viseme와 과중첩 방지.
    // 눈썹·눈은 held(놀람 신호 유지). 입은 진입 시 gasp 일회성 입벌림 후 닫힘(useAnimator).
    expression: { browSurprised: 0.85, eyeSurprised: 0.7 },
    loops: loopsForMood('surprised'),
    gestures: SURPRISED_GESTURES,
  },
  angry: {
    // 눈썹 내림·모음(Angry)으로 sad와 변별 강화
    expression: { angry: 0.8, browAngry: 0.6 },
    loops: loopsForMood('angry'),
    gestures: ANGRY_GESTURES,
  },
};

# drei-avatar-project

VRoid VRM 아바타 에디터 + VTuber 스타일 컴패니언 오버레이.
`@pixiv/three-vrm` + React Three Fiber 기반으로 MToon 셰이더와 절차 애니메이션을 직접 제어합니다.

## 모드

| 모드 | 설명 |
|------|------|
| **에디터** | VRM 로딩, MToon 파라미터 조정, 파츠 show/hide |
| **컴패니언** | 게임 이벤트에 반응하는 오버레이. TTS 립싱크, 시선, 절차 애니메이션 |

## 기술 스택

| 역할 | 도구 |
|------|------|
| VRM 로딩/셰이더 | `@pixiv/three-vrm` v3 |
| 3D 렌더링 | `@react-three/fiber` v8 |
| 헬퍼 | `@react-three/drei` v9 |
| 상태 관리 | Zustand v5 |
| UI | React + Vite + Tailwind |

## 시작하기

```bash
npm install
npm run dev
```

TTS(Google Text-to-Speech)를 사용하려면 `.env` 파일을 만들고 API 키를 입력합니다:

```
VITE_GOOGLE_TTS_API_KEY=your_key_here
```

키가 없으면 말풍선만 표시되고 오디오는 비활성화됩니다.

## 컴패니언 이벤트 연동

외부 게임에서 아래 이벤트를 dispatch하면 컴패니언이 반응합니다:

```ts
window.dispatchEvent(new CustomEvent('game:event', {
  detail: { type: 'level_clear' }
  // type: 'player_die' | 'level_clear' | 'near_miss' | 'jump' | 'start'
}))
```

## 아바타 포맷

VRoid Studio에서 직접 내보낸 `.vrm` 파일을 사용합니다.
`public/avatars/`에 위치시키거나 컴패니언 DebugPanel에서 파일을 직접 불러올 수 있습니다.

> ⚠️ GLB 파일은 VRM 메타데이터가 없어 지원하지 않습니다.

## 프로젝트 구조

```
src/
├── components/       # 에디터 모드 컴포넌트 (AvatarScene, VRMAvatar, EditorPanel 등)
├── companion/        # 컴패니언 모드 (오버레이, TTS, 립싱크, 시선)
│   └── anim/         # 절차 애니메이션 스케줄러 (scheduler, channels, moods)
├── store.ts          # Zustand 전역 상태
└── App.tsx           # 모드 전환 진입점
```

## 참고 문서

프로젝트에서 사용된 3D/수학 개념(오일러 각도, 쿼터니언, FK, 가우시안, 시그모이드 이징, 모프 타겟, 비세임 등)은 아래 문서에서 설명합니다:

→ [docs/concepts.md](docs/concepts.md)

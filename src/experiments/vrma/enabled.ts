// `?vrma=1` 일 때만 VRMA 물색 패널을 띄운다 (기본 UI 무변경).
//
// VrmaPanel.tsx 에서 분리한 이유: 컴포넌트 파일이 컴포넌트가 아닌 값을 함께 내보내면
// Fast Refresh 가 그 파일 전체를 갱신 못 한다(react-refresh/only-export-components).
// URL 을 읽는 계산식이라 상수 리터럴 예외에도 안 걸린다.
export const VRMA_ENABLED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('vrma');

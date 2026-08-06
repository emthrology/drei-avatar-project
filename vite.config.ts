import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// dev 서버가 **자기 신원을 직접 응답**하게 한다. `GET /__probe_id` → { root, pid }
//
// 왜 필요한가: scripts/probeAttach.mjs 가 살아있는 dev 서버에 붙어 프로브를 돌리는데, 포트만
// 보고 붙으면 5173(vite 전역 기본값)을 선점한 **다른 프로젝트의** 서버를 조용히 측정한다.
// 같은 실수를 크롬 쪽에서 실제로 겪었다 — 남이 남긴 9222 헤드리스 크롬에 붙어 63초를 날렸다.
//
// 왜 파일이 아니라 엔드포인트인가: 처음엔 node_modules/.cache 에 {port, root, pid} 를 남겼는데
// **낡은 기록**이 서로 다른 두 방식으로 깨졌다. ①사용자 dev 서버가 IPv6([::1]:5173)면 일회용
// 서버가 IPv4 로 같은 포트에 나란히 붙어 기록을 덮어쓴 뒤 종료하며 지웠다. ②vite.config.ts 를
// 수정하면 dev 서버가 재시작하는데, 그 과정에서 잠깐 뜬 인스턴스가 다른 포트로 기록을 덮었다.
// 살아있는 서버에게 직접 물으면 낡은 상태 자체가 존재할 수 없다.
function probeIdentity(): Plugin {
  return {
    name: 'probe-dev-server-identity',
    apply: 'serve', // build 에는 영향 없음
    configureServer(server) {
      server.middlewares.use('/__probe_id', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ root: server.config.root, pid: process.pid }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), probeIdentity()],
});

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// package.json 이 "type": "module" 이라 __dirname 이 없다
const HERE = dirname(fileURLToPath(import.meta.url))
const STAMP = resolve(HERE, 'node_modules/.cache/dev-server.json')

// dev 서버의 **신원**을 파일로 남긴다 (포트 번호가 아니라).
//
// 배경: scripts/probeAttach.mjs 가 살아있는 dev 서버에 붙어 프로브를 돌리는데, 포트만 보고
// 붙으면 5173(vite 전역 기본값)을 선점한 **다른 프로젝트의** 서버를 조용히 측정한다.
// 실제로 같은 실수를 크롬 쪽에서 겪었다 — 남이 남긴 9222 headless 크롬에 붙어 63초를 날렸다.
// 그래서 포트뿐 아니라 root/pid 를 함께 남기고, 프로브가 셋을 다 확인한 뒤에만 붙는다.
// vite 가 5173 을 못 잡아 5174 로 올라가도 자동으로 따라가는 건 덤이다.
function devServerStamp(): Plugin {
  return {
    name: 'probe-dev-server-stamp',
    apply: 'serve', // build 에는 영향 없음
    configureServer(server) {
      // probeMotion.mjs 가 띄우는 **일회용** 서버는 stamp 를 남기지 않는다.
      // 그 서버는 IPv4 로 같은 포트에 나란히 붙을 수 있어(사용자 dev 서버가 IPv6 인 경우)
      // 기록을 자기 것으로 덮어쓴 뒤 종료하며 지운다 → 살아있는 dev 서버를 못 찾게 된다. 실측함.
      if (process.env.PROBE_OWNED) return

      const write = () => {
        const addr = server.httpServer?.address()
        if (!addr || typeof addr === 'string') return
        try {
          mkdirSync(dirname(STAMP), { recursive: true })
          writeFileSync(
            STAMP,
            JSON.stringify(
              { port: addr.port, root: server.config.root, pid: process.pid },
              null,
              2,
            ),
          )
        } catch {
          /* 캐시를 못 써도 dev 서버는 정상 동작해야 한다 (비퇴행) */
        }
      }
      // ⚠️ **자기 기록일 때만** 지운다. 이 훅은 모든 vite serve 프로세스에 걸리므로, 포트를 못
      // 잡고 곧바로 죽는 인스턴스(예: `npm run probe` 가 띄우는 --strictPort vite)가 살아있는
      // 서버의 stamp 를 지워버린다. 실측으로 겪었다 — 서버는 멀쩡한데 프로브가 못 찾았다.
      const clear = () => {
        try {
          const cur = JSON.parse(readFileSync(STAMP, 'utf8'))
          if (cur.pid !== process.pid) return
          rmSync(STAMP, { force: true })
        } catch {
          /* 파일이 없거나 못 읽으면 할 일 없음 */
        }
      }
      server.httpServer?.once('listening', write)
      server.httpServer?.once('close', clear)
      process.once('exit', clear)
    },
  }
}

export default defineConfig({
  plugins: [react(), devServerStamp()],
})

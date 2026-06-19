// 오프라인 썸네일 렌더러 — 실제 앱 렌더 경로를 puppeteer 로 재사용(MToon/VRM 충실).
//   1) vite dev 서버 기동(public/ 라이브 서빙 — 파생 파츠도 그대로)
//   2) 앱에서 window.__CATALOG 읽어 변형 목록 확보
//   3) 각 변형을 ?thumb=<cat>:<id> 로 방문 → window.__thumbReady 대기 → 스냅샷(투명 배경)
//   4) public/avatars/thumbs/<id>.png 저장
//
// puppeteer(Chromium)가 필요해 Vercel 빌드에선 못 돈다 → 산출 PNG 는 ★커밋★한다(소스 취급).
// 파츠 추출(extractParts)과 한 묶음으로: `npm run assets` = extractParts → renderThumbs.
// 소스 VRM 추가/변경 시 npm run assets 한 번 → 파츠·썸네일 동시 갱신 후 썸네일 커밋.
// 실행: node scripts/renderThumbs.mjs (또는 npm run thumbs / 통합: npm run assets)

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'

const PORT = 5179
const SIZE = 360 // 정사각 뷰포트 → 정사각 PNG
const OUT = 'public/avatars/thumbs'

function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      const s = d.toString()
      if (/Local:.*http/.test(s) || new RegExp(`localhost:${PORT}`).test(s)) resolve()
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`vite 종료(code ${code})`)))
    setTimeout(() => reject(new Error('vite 기동 타임아웃')), 30000)
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
  let browser
  try {
    await waitForServer(server)
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 2 })

    // 카탈로그 확보
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' })
    const catalog = await page.evaluate(() => window.__CATALOG)
    const jobs = catalog.flatMap((c) => c.variants.map((v) => ({ category: c.id, id: v.id, label: v.label })))

    for (const job of jobs) {
      await page.goto(`http://localhost:${PORT}/?thumb=${job.category}:${job.id}`, { waitUntil: 'networkidle0' })
      await page.waitForFunction('window.__thumbReady === true', { timeout: 30000 })
      await new Promise((r) => setTimeout(r, 250)) // 마지막 프레임 안정화
      const buf = await page.screenshot({ omitBackground: true, type: 'png' })
      const dest = path.join(OUT, `${job.id}.png`)
      fs.writeFileSync(dest, buf)
      console.log(`✅ ${dest}  (${job.category} · ${job.label})`)
    }
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error('❌ renderThumbs 실패:', e)
  process.exit(1)
})

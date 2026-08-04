// 손동작 수치 프로브 러너 — 실제 앱을 puppeteer 로 띄워 팔 기하를 재고 판정을 stdout 에 낸다.
//
// 왜: 손인사(wave) FK 튜닝이 5회 실패한 원인은 "값 변경 → 사람이 눈으로 확인 → 피드백"
// 루프였다(docs/wave-gesture-attempts.md). 이 스크립트는 그 루프에서 사람을 뺀다 —
// 값을 바꾸고 `npm run probe` 를 돌리면 어느 지표가 깨졌는지 바로 나온다.
//
// 사용:
//   npm run probe                     기본(오른팔, idle 상태 3초)
//   npm run probe -- --gesture 3      제스처 3번 트리거 후 측정
//   npm run probe -- --side L --ms 4000
//   npm run probe -- --json           원시 샘플까지 JSON 으로 (그래프·재분석용)
//
// renderThumbs.mjs 와 동일 패턴(vite 기동 → puppeteer → window 값 회수).

import { spawn } from 'child_process'
import puppeteer from 'puppeteer'

const PORT = 5180

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

const SIDE = arg('side', 'R')
const MS = Number(arg('ms', 3000))
const GESTURE = arg('gesture', null)
const AS_JSON = has('json')

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

function report(r) {
  if (AS_JSON) {
    console.log(JSON.stringify(r, null, 2))
    return
  }
  if (r.error) {
    console.error(`❌ ${r.error}`)
    return
  }
  console.log(`\n${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.side}팔 · ${r.sampleCount}샘플 / ${r.durationMs}ms`)
  console.log('─'.repeat(58))
  for (const c of r.checks) {
    const mark = c.pass ? '✓' : '✗'
    console.log(`  ${mark} ${c.name.padEnd(12)} ${String(c.value).padStart(10)}   기대 ${c.want}`)
  }
  console.log('─'.repeat(58))
  console.log(
    `  span x=${r.span.x.toFixed(4)} y=${r.span.y.toFixed(4)} z=${r.span.z.toFixed(4)}  ` +
    `주축=${r.swingAxis}\n`,
  )
}

async function main() {
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
  let browser
  try {
    await waitForServer(server)
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    page.on('pageerror', (e) => console.error('  [page error]', e.message))

    await page.goto(`http://localhost:${PORT}/?mode=companion`, { waitUntil: 'networkidle0' })

    // VRM 조립 완료 대기 — 프로브가 본을 못 찾으면 무의미하므로 확실히 기다린다
    await page.waitForFunction(
      "document.body.innerText.includes('ready') || document.body.innerText.includes('speaking')",
      { timeout: 60000 },
    ).catch(() => console.error('  ⚠️ ready 상태 확인 실패 — 그대로 진행'))
    await new Promise((r) => setTimeout(r, 1500)) // idle 루프 안정화

    if (GESTURE !== null) {
      await page.evaluate((i) => {
        window.dispatchEvent(new CustomEvent('companion:gesture', { detail: { index: Number(i) } }))
      }, GESTURE)
      await new Promise((r) => setTimeout(r, 120)) // 제스처 시작 직후부터 측정
    }

    await page.evaluate(
      (ms, side) => {
        window.dispatchEvent(new CustomEvent('companion:probe', { detail: { ms, side } }))
      },
      MS,
      SIDE,
    )

    await page.waitForFunction('window.__probeResult !== undefined', { timeout: MS + 20000 })
    const result = await page.evaluate(() => {
      const r = window.__probeResult
      // 원시 샘플은 --json 일 때만 필요 (수백 개라 기본 출력에선 뺀다)
      return r
    })

    if (!AS_JSON && result && result.samples) delete result.samples
    report(result)
    process.exitCode = result && result.pass ? 0 : 1
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error('❌ probeMotion 실패:', e)
  process.exit(1)
})

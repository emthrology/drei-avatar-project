// 손동작 수치 프로브 러너 — 실제 앱을 puppeteer 로 띄워 팔 기하를 재고 판정을 stdout 에 낸다.
//
// 왜: 손인사(wave) FK 튜닝이 5회 실패한 원인은 "값 변경 → 사람이 눈으로 확인 → 피드백"
// 루프였다(docs/wave-gesture-attempts.md). 이 스크립트는 그 루프에서 사람을 뺀다 —
// 값을 바꾸고 `npm run probe` 를 돌리면 어느 지표가 깨졌는지 바로 나온다.
//
// 사용:
//   npm run probe                     기본(오른팔, idle 상태 3초)
//   npm run probe -- --gesture 3      제스처 3번 트리거 후 측정
//   npm run probe -- --wave           손인사 트리거 후 흔드는 구간만 측정
//   npm run probe -- --wait 500       트리거~녹화 시작 대기(전환 구간 제외)
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
// 쉼표로 여러 제스처를 주면 브라우저 세션 하나에서 순차 측정한다 (vite 기동 비용 1회).
// 자세 스윕은 반복 실행이 많아 매번 재기동하면 대부분의 시간이 부팅에 쓰인다.
const GESTURE = arg('gesture', null)
const GESTURES = GESTURE === null ? [] : String(GESTURE).split(',').map((s) => s.trim())
const WAVE = has('wave')
// 한 측정이 끝나고 다음 트리거까지 팔이 rest 로 돌아올 시간
const SETTLE = Number(arg('settle', 1600))
// 트리거 후 녹화 시작까지 대기(ms). 팔을 드는 **전환 구간**을 빼고 흔드는 구간만 재기 위한 것.
// (raise 를 포함해 재면 '상완 정지도'가 항상 불합격이라 어떤 동작도 통과 불가 — 측정 구간을
//  동작 단계에 맞추는 것이지 기준을 낮추는 것이 아니다.)
const WAIT = Number(arg('wait', WAVE ? 420 : 120))
const CHAR = arg('char', null)
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
    `  손목  span x=${r.span.x.toFixed(4)} y=${r.span.y.toFixed(4)} z=${r.span.z.toFixed(4)}  ` +
    `주축=${r.swingAxis}`,
  )
  if (r.torsoClearance !== undefined) {
    console.log(
      `  몸통이격 ${r.torsoClearance.toFixed(4)}   손바닥 바깥 ${(r.palmOut ?? 0).toFixed(3)} / 정면 ${(r.palmFwd ?? 0).toFixed(3)}`,
    )
  }
  if (r.tipSpan) {
    console.log(
      `  손끝  span x=${r.tipSpan.x.toFixed(4)} y=${r.tipSpan.y.toFixed(4)} z=${r.tipSpan.z.toFixed(4)}  ` +
      `주축=${r.tipSwingAxis}`,
    )
  }
  console.log()
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

    const url = `http://localhost:${PORT}/?mode=companion${CHAR ? `&char=${CHAR}` : ''}`
    await page.goto(url, { waitUntil: 'networkidle0' })

    // VRM 조립 완료 대기 — 프로브가 본을 못 찾으면 무의미하므로 확실히 기다린다
    await page.waitForFunction(
      "document.body.innerText.includes('ready') || document.body.innerText.includes('speaking')",
      { timeout: 60000 },
    ).catch(() => console.error('  ⚠️ ready 상태 확인 실패 — 그대로 진행'))
    await new Promise((r) => setTimeout(r, 1500)) // idle 루프 안정화

    // 트리거 1회 → 대기 → 녹화 → 판정 회수
    async function runOnce(trigger, label) {
      await page.evaluate(() => {
        window.__probeResult = undefined
      })
      if (trigger) await trigger()
      await new Promise((r) => setTimeout(r, WAIT))
      await page.evaluate(
        (ms, side) => {
          window.dispatchEvent(new CustomEvent('companion:probe', { detail: { ms, side } }))
        },
        MS,
        SIDE,
      )
      await page.waitForFunction('window.__probeResult !== undefined', { timeout: MS + 20000 })
      const r = await page.evaluate(() => window.__probeResult)
      if (!AS_JSON && r && r.samples) delete r.samples
      if (label) console.log(`\n■ ${label}`)
      report(r)
      return r
    }

    let result
    if (WAVE) {
      result = await runOnce(() =>
        page.evaluate(() => window.dispatchEvent(new CustomEvent('companion:wave'))),
      )
    } else if (GESTURES.length > 1) {
      const rs = []
      for (const g of GESTURES) {
        rs.push(
          await runOnce(
            () =>
              page.evaluate((i) => {
                window.dispatchEvent(
                  new CustomEvent('companion:gesture', { detail: { index: Number(i) } }),
                )
              }, g),
            `gesture ${g}`,
          ),
        )
        await new Promise((r) => setTimeout(r, SETTLE)) // 다음 트리거 전 팔 복귀 대기
      }
      result = { pass: rs.every((r) => r && r.pass) }
    } else if (GESTURES.length === 1) {
      result = await runOnce(() =>
        page.evaluate((i) => {
          window.dispatchEvent(new CustomEvent('companion:gesture', { detail: { index: Number(i) } }))
        }, GESTURES[0]),
      )
    } else {
      result = await runOnce(null)
    }
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

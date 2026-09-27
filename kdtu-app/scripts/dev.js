// kdtu-app dev orchestrator.
//
// Boots the three pieces of the monorepo in parallel with prefixed logs:
//   [api]     Express + SQLCipher API on :5180
//   [kdtu]    Vue 3 member app on :5181   (proxies /api -> :5180)
//   [admin]   Vue 3 admin app  on :5182   (proxies /api -> :5180)
//
// All three are children of this process; Ctrl-C (SIGINT) tears them down.
// Re-run safe: each child uses --strictPort, so a port collision will surface
// as a child exit and this orchestrator will shut down the rest.
import { spawn } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname

const procs = [
  { name: 'api',   cwd: `${ROOT}server`,      cmd: 'npm',     args: ['run', 'dev'], color: '\x1b[36m' },
  { name: 'kdtu',  cwd: `${ROOT}kdtu`,        cmd: 'npm',     args: ['run', 'dev'], color: '\x1b[32m' },
  { name: 'admin', cwd: `${ROOT}kdtu-admin`,  cmd: 'npm',     args: ['run', 'dev'], color: '\x1b[35m' },
]
const RESET = '\x1b[0m'

function pipe(name, color, child) {
  const tag = `${color}[${name}]${RESET} `
  const prefixLine = (chunk) => {
    const text = chunk.toString()
    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0) continue
      process.stdout.write(tag + line + '\n')
    }
  }
  child.stdout.on('data', prefixLine)
  child.stderr.on('data', prefixLine)
  child.on('exit', (code, signal) => {
    process.stdout.write(`${tag}exited code=${code} signal=${signal}\n`)
    // If one child dies, tear the rest down so the user sees a single failure.
    for (const p of procs) {
      if (p.child && p.child !== child && !p.child.killed) {
        try { p.child.kill('SIGTERM') } catch {}
      }
    }
    process.exit(code ?? 1)
  })
}

for (const p of procs) {
  // API child needs PORT=5180 so the frontends' /api proxy lands correctly.
  const env = p.name === 'api' ? { ...process.env, PORT: '5180' } : process.env
  p.child = spawn(p.cmd, p.args, { cwd: p.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  pipe(p.name, p.color, p.child)
}

const shutdown = (sig) => {
  for (const p of procs) {
    if (p.child && !p.child.killed) {
      try { p.child.kill(sig) } catch {}
    }
  }
}
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.stdout.write('\x1b[1m\x1b[34mkdtu-app dev stack\x1b[0m\n')
process.stdout.write('  API    http://localhost:5180\n')
process.stdout.write('  kdtu   http://localhost:5181\n')
process.stdout.write('  admin  http://localhost:5182\n')
process.stdout.write('  admin  : koordinator_srengseng3 + password printed once by `npm run server:seed`\n')
process.stdout.write('  note   : first login forces a password rotation (403 PASSWORD_RESET_REQUIRED otherwise)\n\n')
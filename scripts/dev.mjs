import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const backend = path.join(root, 'backend')
const apiPort = process.env.API_PORT ?? '8000'
const python = process.platform === 'win32'
  ? path.join(backend, '.venv', 'Scripts', 'python.exe')
  : path.join(backend, '.venv', 'bin', 'python')
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(python)) {
  console.error('Backend Python environment not found. Create backend/.venv and install backend/requirements.txt.')
  process.exit(1)
}

if (!existsSync(vite)) {
  console.error('Vite is not installed. Run npm install from the repository root.')
  process.exit(1)
}

const services = [
  {
    name: 'backend',
    command: python,
    args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort],
    cwd: backend,
    env: { ...process.env, API_HOST: '127.0.0.1', API_PORT: apiPort },
  },
  {
    name: 'frontend',
    command: process.execPath,
    args: [vite, '--host', '127.0.0.1'],
    cwd: root,
    env: process.env,
  },
]

const children = []
let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill()
  }
  setTimeout(() => process.exit(exitCode), 250).unref()
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: service.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(`[${service.name}] ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${service.name}] exited (${signal ?? code ?? 'unknown'})`)
      if (service.name === 'frontend') shutdown(code ?? 1)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

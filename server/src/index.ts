import Fastify from 'fastify'
import cors from '@fastify/cors'
import fs from 'node:fs/promises'
import path from 'node:path'

type BuildInfo = {
  name: string
  version: string
  gitSha: string
  builtAt: string
}

async function readBuildInfo(): Promise<BuildInfo> {
  try {
    const file = await fs.readFile(path.resolve(process.cwd(), 'build-info.json'), 'utf8')
    return JSON.parse(file) as BuildInfo
  } catch {
    return { name: 'assistant-server', version: '0.0.0', gitSha: 'unknown', builtAt: new Date().toISOString() }
  }
}

async function start() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  })

  app.get('/healthz', async () => {
    return { status: 'ok' }
  })

  app.get('/version', async () => {
    const info = await readBuildInfo()
    return info
  })

  const port = Number(process.env.PORT ?? 4000)
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})



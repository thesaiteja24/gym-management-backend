import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

function getEnvFileCandidates() {
  if (process.env.NODE_ENV === 'production') {
    return ['.env', '.env.production']
  }

  if (process.env.NODE_ENV === 'test') {
    return ['.env.test']
  }

  return ['.env.development']
}

function loadEnvFile(envPath: string) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || trimmed === '') {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index === -1) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (value.startsWith('\"') && value.endsWith('\"')) {
      value = value.slice(1, -1)
    }
    else if (value.startsWith('\'') && value.endsWith('\'')) {
      value = value.slice(1, -1)
    }

    if (key) {
      process.env[key] = value.trim()
    }
  }
}

// Programmatically load env files for Node-based Prisma CLI runners if not already in process.env.
if (!process.env.MASTER_URL) {
  try {
    for (const fileName of getEnvFileCandidates()) {
      const envPath = path.resolve(process.cwd(), fileName)
      if (fs.existsSync(envPath)) {
        loadEnvFile(envPath)
        break
      }
    }
  }
  catch {
    // Silent catch if file reading fails
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Prisma CLI commands such as `generate` should not depend on live runtime env.
    // Real DB-backed commands in CI and deploy still pass explicit datasource URLs.
    url: process.env.MASTER_URL || 'postgresql://postgres:password@127.0.0.1:5432/prisma_generate?sslmode=disable',
    shadowDatabaseUrl: process.env.SHADOW_URL || 'postgresql://postgres:password@127.0.0.1:5432/prisma_generate_shadow?sslmode=disable',
  },
})

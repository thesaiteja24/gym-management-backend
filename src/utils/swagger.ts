// src/utils/swagger.ts
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import swaggerUi from 'swagger-ui-express'
import { Express } from 'express'

interface ServerConfig {
	url: string
	description: string
}

interface OpenApiSpec {
	servers?: ServerConfig[]
	[key: string]: unknown
}

const SERVER_MAP: Record<string, ServerConfig[]> = {
	dev: [{ url: 'http://localhost:9999/api/v1', description: 'Local dev' }],
	production: [{ url: 'https://pump.thesaiteja.dev/api/v1', description: 'Production' }],
}

export function mountSwagger(app: Express): void {
	const specPath = path.resolve(process.cwd(), 'docs/api/openapi.yaml')

	if (!fs.existsSync(specPath)) {
		const msg =
			`OpenAPI file not found at ${specPath}\n` +
			`• If your file is at repo-root/docs/api/openapi.yaml, keep this code.\n` +
			`• Otherwise, move the file or update the path.`
		console.error(msg)
		throw new Error(msg)
	}

	const spec = yaml.load(fs.readFileSync(specPath, 'utf8')) as OpenApiSpec

	const env = process.env.NODE_ENV
	const servers = SERVER_MAP[env]

	if (!servers) {
		throw new Error(`Invalid NODE_ENV="${env}". Expected one of: ${Object.keys(SERVER_MAP).join(', ')}`)
	}

	// Inject env-specific servers into the spec
	spec.servers = servers

	app.use(
		'/api/v1/docs',
		swaggerUi.serve,
		swaggerUi.setup(spec, {
			customSiteTitle: 'Gym Management API Docs',
			swaggerOptions: {
				displayRequestDuration: true,
			},
		})
	)
}

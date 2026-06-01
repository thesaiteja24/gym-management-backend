import { buildApp } from './app'

async function start() {
  const app = await buildApp()
  const port = Number(app.config.PORT) || 3000

  try {
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 Server ready at http://localhost:${port}`)
    console.log(`📄 Documentation available at http://localhost:${port}/docs`)
  }
  catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']
  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`)
      await app.close()
      process.exit(0)
    })
  })
}

start()

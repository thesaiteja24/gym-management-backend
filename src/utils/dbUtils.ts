import { logger } from './logger.js'

/**
 * Retries a database operation if it fails due to a transient connection error (P1001).
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await operation()
  } catch (error: any) {
    if (retries > 0 && error.code === 'P1001') {
      logger.warn(`Database connection failed (P1001). Retrying in ${delay}ms... (${retries} attempts left)`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return withRetry(operation, retries - 1, delay)
    }
    throw error
  }
}

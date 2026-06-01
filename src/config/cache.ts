export const CACHE_KEYS = {
  profile: (userId: string) => `user:profile:${userId}`,
  fitness: (userId: string) => `user:fitness:${userId}`,
  nutrition: (userId: string) => `user:nutrition:${userId}`,
  measurements: (userId: string) => `user:measurements:${userId}`,
  analytics: (userId: string) => `user:analytics:${userId}`,
}

export const CACHE_TTL = {
  short: 5 * 60, // 5 minutes
  medium: 15 * 60, // 15 minutes
  long: 60 * 60, // 1 hour
  day: 24 * 60 * 60, // 24 hours (1 day)
  week: 7 * 24 * 60 * 60, // 7 days (1 week)
  forever: 60 * 60 * 24 * 7 * 52, // 1 year
}

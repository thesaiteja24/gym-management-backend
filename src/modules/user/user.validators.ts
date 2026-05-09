import { z } from 'zod'

export const followUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid User ID'),
  }),
})

export const getWorkoutActivitySchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid User ID'),
  }),
  query: z.object({
    days: z.string().optional().transform(v => (v ? parseInt(v) : 60)),
  }),
})

export const getTopLiftsSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid User ID'),
  }),
  query: z.object({
    limit: z.string().optional().transform(v => (v ? parseInt(v) : 5)),
  }),
})

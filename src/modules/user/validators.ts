import { z } from 'zod'

export const followUserSchema = z.object({
  params: z.object({
    id: z.uuid('Invalid User ID'),
  }),
})

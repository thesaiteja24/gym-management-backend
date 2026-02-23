import { z } from 'zod'

export const createCommentSchema = z.object({
	params: z
		.object({
			id: z.uuid('Invalid Workout ID'),
		})
		.strict(),
	body: z
		.object({
			content: z
				.string()
				.min(1, 'Comment cannot be empty')
				.max(1000, 'Comment cannot be longer than 1000 characters'),
			parentId: z.uuid('Invalid Parent ID').optional(),
		})
		.strict(),
})

export const getCommentsSchema = z.object({
	params: z
		.object({
			id: z.uuid('Invalid ID'),
		})
		.strict(),
	query: z
		.object({
			limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
			cursor: z.uuid('Invalid Cursor ID').optional(),
			isReply: z.string().optional(),
		})
		.strict(),
})

export const getRepliesSchema = getCommentsSchema

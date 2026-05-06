import type { NextFunction, Request, Response } from 'express'
import type { z } from 'zod'
import { ZodError } from 'zod'

import { ApiError } from '../utils/ApiError.js'

type AnyZodObject = z.ZodObject<z.ZodRawShape>

// Generic types for typed middleware
export const validateResource =
  <T extends AnyZodObject>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Parse and transform
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
        file: req.file,
        files: req.files,
      })

      // Assign parsed values back to request safely
      if (parsed.body) req.body = parsed.body
      if (parsed.query) {
        Object.defineProperty(req, 'query', {
          value: parsed.query,
          writable: true,
          configurable: true,
          enumerable: true,
        })
      }
      if (parsed.params) req.params = parsed.params as Record<string, string>

      next()
    } catch (e: unknown) {
      if (e instanceof ZodError) {
        const errorDetails = e.issues.map((iss) => ({
          field: iss.path.join('.'),
          message: iss.message,
          received: 'received' in iss ? (iss as { received?: unknown }).received : undefined,
        }))

        next(new ApiError(400, 'Validation failed: ' + errorDetails[0].message, errorDetails))
      } else {
        next(e)
      }
    }
  }

// Helper type to extract validated type from a Zod schema
export type ValidatedRequest<T extends AnyZodObject> = Request<
  z.infer<T>['params'],
  unknown,
  z.infer<T>['body'],
  z.infer<T>['query']
>

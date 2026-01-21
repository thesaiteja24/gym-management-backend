/**
 * Capitalizes the first letter of each word in a string
 * @param str - Input string (single word or sentences)
 * @returns Capitalized string
 */
export const titleizeString = (str: string | null | undefined): string => {
	if (!str || typeof str !== 'string') {
		return ''
	}

	// Trim whitespace and handle empty string
	const trimmed = str.trim()
	if (trimmed.length === 0) {
		return ''
	}

	// Split by words and capitalize first letter of each word
	const words = trimmed.split(/\s+/)

	let result = ''

	for (let i = 0; i < words.length; i++) {
		const part = words[i]

		// Check if it's a sentence terminator
		if (/^[.!?]\s+$/.test(part)) {
			result += part
		} else if (part.length > 0) {
			// Capitalize first letter of the word
			result += part.charAt(0).toUpperCase() + part.slice(1)
			// Add space between words except for the last word
			if (i < words.length - 1) {
				result += ' '
			}
		}
	}

	return result
}

import { randomBytes } from 'crypto'

/**
 * Generates a cryptographically secure, URL-safe opaque token.
 *
 * This token is designed to be used as a public capability identifier
 * (e.g. share links, invite links, magic links, or one-time actions).
 * It is:
 * - Random and unguessable (128 bits of entropy)
 * - URL-safe (base64url encoded)
 * - Opaque (contains no embedded metadata or meaning)
 *
 * Each invocation returns a new, independent value and does not rely
 * on any external state.
 *
 * @returns {string} A URL-safe secure token (~22 characters).
 */
export const generateSecureToken = (): string => {
	return randomBytes(16).toString('base64url')
}

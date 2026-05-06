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

export const calculateAge = (dateOfBirth: Date): number => {
  const today = new Date()
  const diff = today.getTime() - dateOfBirth.getTime()
  const ageDate = new Date(diff)
  return Math.abs(ageDate.getUTCFullYear() - 1970)
}

export const formatTimeAgo = (date: Date, daysOnly: boolean = false): string => {
  const diffMs = new Date().getTime() - date.getTime()
  const days = Math.floor(diffMs / 86400000)

  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7 || daysOnly) return `${days} days ago`

  const units = [
    { label: 'year', value: 365 },
    { label: 'month', value: 30 },
    { label: 'week', value: 7 },
  ]

  for (const { label, value } of units) {
    if (days >= value) {
      const count = Math.floor(days / value)
      return `${count} ${label}${count > 1 ? 's' : ''} ago`
    }
  }

  return `${days} days ago`
}

/**
 * Formats a number into a compact string (e.g., 1k, 200k, 1M)
 */
export function formatCompactNumber(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return count.toString()
}

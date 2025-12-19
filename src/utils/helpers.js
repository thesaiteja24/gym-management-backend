/**
 * Capitalizes the first letter of each word in a string
 * @param {string} str - Input string (single word or sentences)
 * @returns {string} - Capitalized string
 */
export const titleizeString = str => {
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

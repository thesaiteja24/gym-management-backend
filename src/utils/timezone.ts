/**
 * Checks whether a string is a valid IANA timezone identifier.
 * @param timezone The timezone value to validate.
 * @returns True when the value can be used by Intl timezone formatting.
 */
export function isValidTimeZone(timezone: string) {
  if (!timezone.trim()) {
    return false
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  }
  catch {
    return false
  }
}

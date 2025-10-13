import twilio from 'twilio'
import { logInfo } from '../utils/logger.js'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
let client

try {
	client = twilio(accountSid, authToken)
	logInfo('Twilio client initialized successfully', {}, null)
} catch (error) {
	logError('Failed twilioInit: Setup error', error, { error: error.message }, null)
	throw new Error('Twilio setup failed')
}

// Helper to poll for message status
const waitForStatus = async (sid, targetStatuses = ['sent', 'delivered'], timeoutMs = 30000, pollIntervalMs = 100) => {
	const startTime = Date.now()
	while (Date.now() - startTime < timeoutMs) {
		const msg = await client.messages(sid).fetch()
		// logInfo(`Polling status for SID ${sid}: ${msg.status}`)

		if (targetStatuses.includes(msg.status)) {
			return { success: true, status: msg.status, sid }
		}
		if (['failed', 'undelivered'].includes(msg.status)) {
			throw new Error(`Message ${msg.status}`)
		}

		await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
	}
	throw new Error('Status check timed out')
}

export const createMessage = async (message, phoneE164) => {
	const msg = await client.messages.create({
		body: message,
		from: process.env.TWILIO_PHONE_NUMBER,
		to: phoneE164,
	})
	const statusCheck = waitForStatus(msg.sid)
	return { success: true, sid: msg.sid, initialStatus: msg.status, statusCheck }
}

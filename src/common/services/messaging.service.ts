import twilio from 'twilio'
import { logInfo, logWarn, logError } from '../utils/logger.js'

interface MessageStatusResult {
	success: boolean
	status: string
	sid: string
}

interface CreateMessageResult {
	success: boolean
	sid: string
	initialStatus: string
	statusCheck: Promise<MessageStatusResult>
}

/**
 * Toggle to enable/disable actual SMS delivery.
 * Set ENABLE_SMS=true in production where Twilio is available.
 */
const SMS_ENABLED = process.env.ENABLE_SMS === 'true'

// Twilio client (initialized only when SMS_ENABLED)
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
let client: twilio.Twilio | null = null

if (SMS_ENABLED) {
	try {
		client = twilio(accountSid, authToken)
		logInfo('Twilio client initialized successfully', {}, null)
	} catch (error) {
		const err = error as Error
		logError('Failed twilioInit: Setup error', err, { error: err.message }, null)
		// rethrow so startup fails loudly if SMS is intended to be enabled
		throw new Error('Twilio setup failed')
	}
} else {
	logWarn('Twilio SMS disabled (ENABLE_SMS=false). Using stub messaging service.', {}, null)
}

/**
 * Real polling for Twilio message status.
 * Polls until a target status or timeout. Throws on failed/undelivered.
 */
const waitForStatus = async (
	sid: string,
	targetStatuses: string[] = ['sent', 'delivered'],
	timeoutMs: number = 30000,
	pollIntervalMs: number = 100
): Promise<MessageStatusResult> => {
	if (!client) {
		throw new Error('Twilio client not initialized')
	}

	const startTime = Date.now()
	while (Date.now() - startTime < timeoutMs) {
		// fetch current message status
		const msg = await client.messages(sid).fetch()

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

/**
 * Stubbed status checker used when SMS is disabled.
 * Resolves quickly with a 'skipped' status to emulate successful-but-not-sent messages.
 */
const waitForStatusStub = async (sid: string): Promise<MessageStatusResult> => {
	// small delay to emulate async behaviour
	await new Promise(res => setTimeout(res, 100))
	return { success: true, status: 'skipped', sid }
}

/**
 * Create a real Twilio message and return an object with a statusCheck promise.
 */
const createMessageReal = async (message: string, phoneE164: string): Promise<CreateMessageResult> => {
	if (!client) {
		throw new Error('Twilio client not initialized')
	}

	const msg = await client.messages.create({
		body: message,
		from: process.env.TWILIO_PHONE_NUMBER,
		to: phoneE164,
		riskCheck: 'disable',
	})

	const statusCheck = waitForStatus(msg.sid)
	return { success: true, sid: msg.sid, initialStatus: msg.status, statusCheck }
}

/**
 * Create a stub message when SMS is disabled.
 * Returns the same shape but does not contact any provider.
 */
const createMessageStub = async (message: string, phoneE164: string): Promise<CreateMessageResult> => {
	const sid = `stub-${Date.now()}`

	logInfo(
		'SMS Disabled → Skipping send. Message not delivered to recipient.',
		{ action: 'smsDisabledStub', to: phoneE164, messageSnippet: String(message).slice(0, 80), sid },
		null
	)

	return {
		success: true,
		sid,
		initialStatus: 'skipped',
		statusCheck: waitForStatusStub(sid),
	}
}

/**
 * Unified exported createMessage function.
 * Uses real Twilio when SMS_ENABLED=true, otherwise uses a stub that mimics the same return shape.
 *
 * Usage in controllers stays identical:
 * const createdMessage = await createMessage(message, phoneE164)
 * const statusResult = await createdMessage.statusCheck
 */
export const createMessage = async (message: string, phoneE164: string): Promise<CreateMessageResult> => {
	if (!SMS_ENABLED) {
		return createMessageStub(message, phoneE164)
	}

	// real path
	return createMessageReal(message, phoneE164)
}

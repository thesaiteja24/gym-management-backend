import type { BuildNudgeNotificationParams, NudgeNotification } from './nudge.types.js'

type NudgeTemplate = {
  title: string
  content: string
}

const templates = {
  highly_active: [
    { title: 'Momentum looks good 🔥', content: '{user} noticed your consistency and sent some hype.' },
    { title: 'Keep the streak alive', content: '{user} thinks you’re crushing it lately. Keep going!' },
    { title: 'Unstoppable 😤', content: '{user} is hyping up your recent workouts. Don’t slow down now.' },
  ],
  consistent: [
    { title: 'You’re on a roll', content: '{user} sees the consistency. Keep the momentum going.' },
    { title: 'Another day stronger', content: '{user} sent a little push to help you stay on track.' },
    { title: 'Consistency is key', content: '{user} noticed you’ve been putting in the work.' },
  ],
  cooling_off: [
    { title: 'Don’t break the routine', content: '{user} wants to make sure you keep the momentum going strong.' },
    { title: 'Time for a session?', content: '{user} sent a nudge to keep you on schedule.' },
    { title: 'Ready for the next one?', content: 'A little reminder from {user} to keep pushing forward.' },
  ],
  inactive: [
    { title: 'Time to get moving', content: '{user} sent you a nudge to get back into the groove.' },
    { title: 'Small steps count', content: 'Every streak starts with one workout. {user} believes in you.' },
    { title: 'A fresh start today', content: '{user} thought now might be the perfect time to jump back in.' },
  ],
  returning: [
    { title: 'Good to see you back', content: '{user} is pumped to see you hitting the gym again!' },
    { title: 'The comeback is on', content: '{user} noticed you’re back at it. Let’s go!' },
    { title: 'Welcome back 🔥', content: '{user} sent some energy for your return.' },
  ],
  new_user: [
    { title: 'Your first workout awaits', content: '{user} is waiting to see your first session.' },
    { title: 'Ready to start?', content: '{user} sent a nudge to help you kick things off.' },
  ],
}

const intents = {
  celebrate: [
    { title: 'Huge week lately 🔥', content: '{user} is celebrating your recent progress!' },
    { title: 'Crushing it', content: '{user} sent some hype your way to celebrate.' },
  ],
  comeback: [
    { title: 'One workout is all it takes', content: '{user} knows you can restart the engine.' },
    { title: 'Time for a comeback', content: '{user} believes in you. Let’s get back to it.' },
  ],
  challenge: [
    { title: 'Got one more in you?', content: '{user} is challenging you to hit another session this week.' },
    { title: 'Push the limits', content: '{user} thinks you’ve got more in the tank.' },
  ],
  support: [
    { title: 'Here to support you', content: '{user} is cheering you on.' },
    { title: 'You’ve got this', content: '{user} sent some positive vibes your way.' },
  ],
  encourage: [
    { title: 'Keep pushing', content: '{user} sent a little motivation to keep you moving.' },
    { title: 'Stay strong', content: '{user} is rooting for you today.' },
  ],
}

const relationshipPrefixes = {
  mutual: 'Your friend {user}',
  follower: '{user}', // They follow the sender
  following: '{user}', // Sender follows them
  none: '{user}',
}

const personalNoteNudges: NudgeTemplate[] = [
  { title: '{user} sent you a note', content: '{note}' },
  { title: 'A message from {user}', content: '{note}' },
  { title: '{user} is cheering you on', content: '{note}' },
  { title: 'You got a note from {user}', content: '{note}' },
]

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function replacePlaceholders(text: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    text
  )
}

function isIntentValidForState(intent: string, state: string): boolean {
  switch (intent) {
    case 'celebrate':
      return ['highly_active', 'consistent', 'returning'].includes(state)
    case 'challenge':
      return ['highly_active', 'consistent'].includes(state)
    case 'comeback':
      return ['inactive', 'cooling_off'].includes(state)
    case 'encourage':
    case 'support':
      return true // Always valid
    default:
      return false
  }
}

export function resolveNudgeTemplate({
  senderName,
  state,
  relationship,
  intent,
  personalNote,
}: BuildNudgeNotificationParams): NudgeNotification {
  let template: NudgeTemplate

  let validIntent = intent
  if (intent && !isIntentValidForState(intent, state)) {
    validIntent = undefined // Ignore the intent if it mismatches the actual state
  }

  if (personalNote) {
    template = getRandomItem(personalNoteNudges)
  } else if (validIntent && intents[validIntent]) {
    template = getRandomItem(intents[validIntent])
  } else {
    template = getRandomItem(templates[state])
  }

  // Adjust sender name based on relationship if we want to be more specific,
  // but for now, we'll just use the raw sender name or the relationship prefix
  const formattedSender = relationshipPrefixes[relationship].replace('{user}', senderName)

  return {
    title: replacePlaceholders(template.title, {
      user: formattedSender,
    }),
    content: replacePlaceholders(template.content, {
      user: formattedSender,
      note: personalNote ?? '',
    }),
  }
}

type NudgeTemplate = {
  title: string;
  content: string;
};

type BuildNudgeNotificationParams = {
  senderName: string;
  hasActiveStreak: boolean;
  personalNote?: string | null;
};

type NudgeNotification = {
  title: string;
  content: string;
};

const activeNudges: NudgeTemplate[] = [
  {
    title: "Keep the streak alive 🔥",
    content:
      "{user} nudged you to keep pushing forward. Your streak is looking strong."
  },
  {
    title: "You’re on a roll",
    content:
      "{user} thinks you’ve got more in the tank. Keep the streak going."
  },
  {
    title: "Momentum looks good",
    content:
      "{user} noticed your consistency and sent some motivation your way."
  },
  {
    title: "Don’t break the streak",
    content:
      "{user} wants you to keep the momentum going strong."
  },
  {
    title: "Another day stronger",
    content:
      "{user} sent a little push to help you stay on track."
  }
];

const inactiveNudges: NudgeTemplate[] = [
  {
    title: "Time to get moving",
    content:
      "{user} sent you a nudge to get back into the groove."
  },
  {
    title: "Small steps count",
    content:
      "Every streak starts with one workout. {user} believes in you."
  },
  {
    title: "A fresh start today",
    content:
      "{user} thought now might be the perfect time to jump back in."
  },
  {
    title: "Your next workout starts here",
    content:
      "{user} sent a little motivation your way."
  },
  {
    title: "Ready to get back at it?",
    content:
      "No pressure. Just a reminder from {user} to keep moving forward."
  }
];

const personalNoteNudges: NudgeTemplate[] = [
  {
    title: "{user} sent you a note",
    content: "{note}"
  },
  {
    title: "A message from {user}",
    content: "{note}"
  },
  {
    title: "{user} is cheering you on",
    content: "{note}"
  },
  {
    title: "You got a note from {user}",
    content: "{note}"
  }
];

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function replacePlaceholders(
  text: string,
  replacements: Record<string, string>
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, value),
    text
  );
}

export function buildNudgeNotification({
  senderName,
  hasActiveStreak,
  personalNote
}: BuildNudgeNotificationParams): NudgeNotification {
  const template = personalNote
    ? getRandomItem(personalNoteNudges)
    : hasActiveStreak
      ? getRandomItem(activeNudges)
      : getRandomItem(inactiveNudges);

  return {
    title: replacePlaceholders(template.title, {
      user: senderName
    }),

    content: replacePlaceholders(template.content, {
      user: senderName,
      note: personalNote ?? ""
    })
  };
}
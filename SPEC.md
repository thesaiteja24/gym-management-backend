# Pump Habit System Redesign Specification

## 1. Goal

Build a habit system for the Pump app that supports:

- Manual habits such as water intake, meditation, sleep, and stretching.
- Internal habits derived from Pump data that already exists.
- Binary, quantity, duration, and count tracking.
- Daily, weekly, and monthly targets.
- Multiple reminders per habit.
- Derived streak and consistency statistics.
- OneSignal push delivery for habit reminders.

This is an MVP specification. It intentionally avoids adding automation for data that Pump does not currently store.

## 2. Key Decisions

### 2.1 Habit logs are daily summaries

`HabitLog` stores one summary row per habit and user-local calendar date:

```text
Drink Water on 2026-06-02 -> value = 2.50
Workout 4x Weekly on 2026-06-02 -> value = 1
```

It is not an event table. If individual water entries or detailed activity events are required later, add a separate event table and project those events into `HabitLog`.

### 2.2 Statistics are derived

Do not store current streak, best streak, or consistency percentage. Derive them from habit configuration and logs so historical edits, deletions, and late synchronization remain correct.

### 2.3 UTC timestamps and local calendar dates serve different purposes

- Store event timestamps and reminder execution timestamps in UTC.
- Store `HabitLog.date` as the calendar date in the user's IANA timezone.
- Detect the timezone on the mobile client and sync it to the backend.

Example:

```text
Workout timestamp: 2026-06-02T20:00:00Z
User timezone:     Asia/Kolkata
Habit log date:    2026-06-03
```

### 2.4 Pump reminder delivery uses a cron-only MVP

Do not add BullMQ or a separate notification microservice for Pump at this stage.

Deploy one scheduled command from this repository every minute:

```text
PostgreSQL due reminders -> OneSignal API -> delivery status update
```

The scheduler is part of the same codebase but runs as a separate process. It must not run inside the Fastify API process because API scaling would start multiple schedulers unintentionally.

## 3. Supported Internal Metrics

Implement only metrics backed by the current Pump schema:

```prisma
enum InternalHabitMetric {
  workoutCompleted
  programDayCompleted
  weightLogged
}
```

| Metric | Existing source | Completion evidence |
| --- | --- | --- |
| `workoutCompleted` | `WorkoutLog` | A non-deleted workout log |
| `programDayCompleted` | `UserProgramDay` | `completed = true` |
| `weightLogged` | `UserMeasurement` | `weight IS NOT NULL` |

Do not add `proteinTargetHit`, `caloriesTargetHit`, `waterTargetHit`, `stepsTargetHit`, or `sleepTargetHit` yet. Pump does not currently store the daily source evidence needed to automate them.

## 4. Final Prisma Schema

Add `timezone` and `weekStartsOn` to `User`, then replace the current habit models and enums with the following.

```prisma
model User {
  // Existing fields...
  timezone     String @default("UTC")
  weekStartsOn Int    @default(1) // 0=Sun, 1=Mon, ..., 6=Sat

  // Existing relations...
  habits Habit[]
}

model Habit {
  id             String              @id @default(uuid(7))
  userId         String

  title          String
  description    String?
  icon           String?
  colorScheme    String?

  category       HabitCategory
  trackingType   HabitTrackingType
  targetPeriod   HabitTargetPeriod   @default(daily)
  targetValue    Decimal?            @db.Decimal(10, 2)
  unit           String?

  source         HabitSource         @default(manual)
  internalMetric InternalHabitMetric?

  isActive       Boolean             @default(true)
  startDate      DateTime            @db.Date
  endDate        DateTime?           @db.Date
  sortOrder      Int                 @default(0)

  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  user           User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  logs           HabitLog[]
  reminders      HabitReminder[]

  @@index([userId, isActive])
  @@index([userId, category])
  @@index([userId, source, internalMetric])
}

model HabitLog {
  id          String         @id @default(uuid(7))
  habitId     String
  date        DateTime       @db.Date

  value       Decimal?       @db.Decimal(10, 2)
  completed   Boolean        @default(false)
  source      HabitLogSource @default(manual)

  note        String?
  metadata    Json?

  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  habit       Habit          @relation(fields: [habitId], references: [id], onDelete: Cascade)

  @@unique([habitId, date])
  @@index([date])
}

model HabitReminder {
  id            String                  @id @default(uuid(7))
  habitId       String

  time          String                  // "07:30"
  timezone      String                  // "Asia/Kolkata"
  daysOfWeek    Int[]                   // 0=Sun, 1=Mon, ..., 6=Sat
  nextTriggerAt DateTime?

  isEnabled     Boolean                 @default(true)

  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt

  habit         Habit                   @relation(fields: [habitId], references: [id], onDelete: Cascade)
  deliveries    HabitReminderDelivery[]

  @@index([habitId])
  @@index([isEnabled, nextTriggerAt])
}

model HabitReminderDelivery {
  id             String                      @id @default(uuid(7))
  reminderId     String
  scheduledAt    DateTime

  status         HabitReminderDeliveryStatus @default(pending)
  attempts       Int                         @default(0)
  sentAt         DateTime?
  providerId     String?
  lastError      String?

  createdAt      DateTime                    @default(now())
  updatedAt      DateTime                    @updatedAt

  reminder       HabitReminder               @relation(fields: [reminderId], references: [id], onDelete: Cascade)

  @@unique([reminderId, scheduledAt])
  @@index([status, scheduledAt])
}

enum HabitCategory {
  training
  nutrition
  recovery
  bodyMetrics
  lifestyle
}

enum HabitTrackingType {
  binary
  quantity
  duration
  count
}

enum HabitTargetPeriod {
  daily
  weekly
  monthly
}

enum HabitSource {
  manual
  internal
  integration
}

enum HabitLogSource {
  manual
  internal
  integration
}

enum InternalHabitMetric {
  workoutCompleted
  programDayCompleted
  weightLogged
}

enum HabitReminderDeliveryStatus {
  pending
  sent
  failed
  skipped
}
```

### 4.1 Why `HabitReminderDelivery` is required

This table is small but important:

- `@@unique([reminderId, scheduledAt])` prevents two overlapping cron runs from creating duplicate sends.
- Failed calls can be retried.
- OneSignal message IDs can be stored for troubleshooting.
- Delivery history is available without storing future notification instances.

## 5. Validation Rules

Enforce these in Zod schemas and the service layer:

- Derive `userId` from the authenticated session. Never accept it from a request body.
- `title` is required and trimmed.
- `targetValue > 0` is required for `quantity`, `duration`, and `count`.
- `unit` is required for `quantity` and `duration`.
- `source = internal` requires `internalMetric`.
- `source != internal` must not provide `internalMetric`.
- Users cannot manually write logs for internal habits.
- `startDate <= endDate` when `endDate` exists.
- `weekStartsOn` must be an integer from `0` to `6`.
- `timezone` must be a valid IANA timezone such as `Asia/Kolkata`.
- Reminder `time` must match `HH:mm`.
- Reminder `daysOfWeek` values must be unique integers from `0` to `6`.
- Reminder ownership must be verified through the owning habit.

Use archive semantics for normal habit deletion:

```text
DELETE /habits/:habitId -> set isActive = false
```

Do not delete historical habit logs during normal user actions.

## 6. Completion Rules

`HabitLog.completed` is a cached daily result for fast UI reads. The service layer must calculate it whenever a log is written.

| Tracking type | Daily completion |
| --- | --- |
| `binary` | `completed = true` |
| `quantity` | `value >= targetValue` |
| `duration` | `value >= targetValue` |
| `count` with daily target | Daily `value >= targetValue` |

For weekly and monthly targets, calculate period completion from the sum of daily values:

```text
SUM(HabitLog.value within period) >= Habit.targetValue
```

Do not treat a single daily `completed` value as proof that a weekly or monthly target was achieved.

## 7. API Endpoints

All routes are authenticated and registered under `/api/v1`.

### 7.1 User preferences

```text
PATCH /users/me/preferences
```

```json
{
  "timezone": "Asia/Kolkata",
  "weekStartsOn": 1
}
```

The mobile app should detect and send the timezone during onboarding and periodically on app startup:

```ts
Intl.DateTimeFormat().resolvedOptions().timeZone
```

Do not automatically change existing reminder timezones during travel. Ask the user before changing notification behavior.

### 7.2 Habit CRUD

```text
POST   /habits
GET    /habits
GET    /habits/today
GET    /habits/:habitId
PATCH  /habits/:habitId
DELETE /habits/:habitId
```

Example manual habit creation:

```json
{
  "title": "Drink Water",
  "category": "nutrition",
  "trackingType": "quantity",
  "targetPeriod": "daily",
  "targetValue": 3,
  "unit": "L",
  "source": "manual",
  "startDate": "2026-06-02"
}
```

Internal habits should initially be seeded or created by trusted server-side logic. Do not allow arbitrary clients to create internal habits.

### 7.3 Habit logs

```text
PUT    /habits/:habitId/logs/:date
DELETE /habits/:habitId/logs/:date
```

`PUT` uses upsert semantics because one daily summary exists per habit.

Example:

```json
{
  "value": 2.5,
  "note": "Less water today"
}
```

The API calculates `completed`; clients should not set it for quantity, duration, or count habits.

For a manual binary habit:

```json
{
  "completed": true
}
```

### 7.4 Stats

```text
GET /habits/:habitId/stats
```

Example response data:

```json
{
  "currentStreak": 4,
  "bestStreak": 18,
  "streakPeriod": "daily",
  "weeklyCompletion": 71,
  "monthlyCompletion": 82,
  "totalCompletedPeriods": 46
}
```

Streak period depends on `targetPeriod`:

- Daily target: consecutive completed days.
- Weekly target: consecutive completed weeks.
- Monthly target: consecutive completed months.

### 7.5 Reminder CRUD

```text
POST   /habits/:habitId/reminders
PATCH  /habits/:habitId/reminders/:reminderId
DELETE /habits/:habitId/reminders/:reminderId
```

Example:

```json
{
  "time": "07:30",
  "timezone": "Asia/Kolkata",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "isEnabled": true
}
```

Default `timezone` to `User.timezone` when omitted. Creating or updating a reminder recalculates `nextTriggerAt`. Deleting a reminder disables it for normal user actions.

## 8. Internal Habit Automation

Internal automation must recalculate a daily total from source records and upsert `HabitLog`. Never increment blindly.

Why:

- Requests may retry.
- Workouts can be edited.
- `WorkoutLog` supports soft deletion through `deletedAt`.
- Measurements can be updated or deleted.

### 8.1 Reconciliation function

Implement a shared function:

```ts
reconcileInternalHabitLogs({
  userId,
  metric,
  localDates,
})
```

For each local date:

1. Find active internal habits matching the metric.
2. Query the source-of-truth count for that date.
3. Upsert a daily `HabitLog` with `source = internal`.
4. Delete or zero the projected log when no source evidence remains.

### 8.2 Hook points

Call reconciliation after source mutations:

| Source mutation | Metric |
| --- | --- |
| Workout create, edit, soft delete, restore | `workoutCompleted` |
| Program day marked complete or incomplete | `programDayCompleted` |
| Measurement create, edit, delete when weight is involved | `weightLogged` |

If a mutation changes its local date, reconcile both the old and new dates.

Use the user's timezone to determine local dates. Integrate hooks as the corresponding write endpoints are implemented. Weight hooks can be added immediately because measurement write routes already exist.

## 9. OneSignal Integration

### 9.1 Mobile setup

The mobile app must initialize the OneSignal SDK and associate the signed-in user with the Pump user ID as OneSignal `external_id`.

On logout, remove that association.

### 9.2 Backend client

Add a focused OneSignal client:

```text
src/services/onesignal.service.ts
```

Required environment variables:

```text
ONESIGNAL_APP_ID
ONESIGNAL_API_KEY
```

Send a transactional push through:

```text
POST https://api.onesignal.com/notifications
```

Target the user through:

```json
{
  "target_channel": "push",
  "include_aliases": {
    "external_id": ["pump-user-id"]
  }
}
```

Use a stable OneSignal `idempotency_key` derived from:

```text
HabitReminderDelivery.id
```

Reuse the same key for retries. This prevents duplicate OneSignal messages when a request times out after OneSignal accepted it.

## 10. Cron Scheduler Design

### 10.1 Placement

Keep the scheduler in this repository:

```text
src/workers/habit-reminder.scheduler.ts
```

Add a command:

```json
{
  "scripts": {
    "reminders:dispatch": "bun run src/workers/habit-reminder.scheduler.ts"
  }
}
```

Deploy exactly one platform cron or scheduled task:

```text
* * * * * bun run reminders:dispatch
```

The command runs once and exits. Do not embed a permanent interval in `src/server.ts`.

### 10.2 Scheduler algorithm

Each invocation:

```text
1. Select enabled reminders with nextTriggerAt <= now.
2. Join only active habits within startDate/endDate.
3. Claim due reminders transactionally.
4. Create one HabitReminderDelivery per reminder and scheduledAt.
5. Advance each reminder to its next valid nextTriggerAt.
6. Commit the transaction.
7. Send pending and retryable deliveries to OneSignal.
8. Mark each delivery as sent, failed, or skipped.
```

Use a PostgreSQL transaction with row locking:

```sql
FOR UPDATE SKIP LOCKED
```

Process a bounded batch such as `100` reminders per invocation. The unique delivery constraint provides an additional deduplication guard.

### 10.3 Delayed and stale reminders

Use `nextTriggerAt <= now`, not exact timestamp equality.

Recommended MVP policy:

- Up to 5 minutes late: send.
- More than 5 minutes late: mark `skipped`.
- Always advance `nextTriggerAt` after claiming the occurrence.

This avoids sending outdated reminders after a long deployment or outage.

### 10.4 Retry policy

Retry failed deliveries on subsequent cron runs:

- Maximum attempts: `3`.
- Retry network errors, timeouts, HTTP `429`, and HTTP `5xx`.
- Do not retry invalid payload or authentication errors until configuration is fixed.
- Reuse the same OneSignal `idempotency_key` for every retry.

If the scheduler crashes after OneSignal accepts the request but before the database update, the next run retries with the same idempotency key.

### 10.5 Why no separate service

The Pump reminder workload is currently narrow:

- Only habit reminders.
- Moderate traffic.
- One delivery channel.
- One delivery provider.

A separate notification microservice and queue would add deployment and operational complexity without solving a current requirement. Extract a service later if Pump adds multiple notification domains, high fan-out sends, or multiple delivery channels.

## 11. Implementation Phases

### Phase 1: Schema foundation

1. Update Prisma models and enums.
2. Create and apply a Prisma migration.
3. Regenerate the Prisma client.
4. Add timezone validation utilities.
5. Add user preference update support.

Verification:

- Prisma validation passes.
- Migration applies on a clean test database.
- User timezone and week start can be updated safely.

### Phase 2: Manual habit APIs

1. Replace the draft habit Zod schemas.
2. Add authenticated habit CRUD routes.
3. Add daily log upsert and delete routes.
4. Centralize completion calculation.
5. Archive habits instead of deleting them.

Verification:

- Ownership checks reject cross-user access.
- Binary, quantity, duration, and count validation works.
- Daily log upsert preserves one row per habit and date.

### Phase 3: Read models and stats

1. Implement `GET /habits/today`.
2. Implement habit stats.
3. Derive daily, weekly, and monthly period completion.
4. Derive current streak, best streak, and completion percentages.

Verification:

- Stats update correctly after historical log edits and deletes.
- Weekly calculations respect `User.weekStartsOn`.
- Local dates respect `User.timezone`.

### Phase 4: Internal automation

1. Implement the reusable reconciliation service.
2. Integrate `weightLogged` with measurement create, update, and delete.
3. Integrate `workoutCompleted` when workout mutation services are available.
4. Integrate `programDayCompleted` when program-day mutation services are available.
5. Add an optional backfill script for existing internal source records.

Verification:

- Repeated reconciliation is idempotent.
- Deleted or moved source records update projections correctly.
- Internal logs cannot be edited manually.

### Phase 5: Reminder configuration

1. Add reminder CRUD routes.
2. Calculate `nextTriggerAt` from timezone, local time, and weekdays.
3. Add delivery ledger writes.
4. Add the two OneSignal environment variables.
5. Configure the mobile OneSignal SDK and external user ID association.

Verification:

- Multiple reminders can exist for one habit.
- Disabling, editing, or archiving a reminder prevents future sends.
- Daylight-saving transitions use the reminder's IANA timezone correctly.

### Phase 6: Cron delivery

1. Add the OneSignal client.
2. Add the once-per-run scheduler command.
3. Add transactional claims and bounded batches.
4. Add OneSignal idempotency keys.
5. Add retry and stale-delivery handling.
6. Deploy one platform cron invocation every minute.

Verification:

- A reminder due at `09:00` is delivered when cron runs at `09:01`.
- Two overlapping scheduler runs create only one delivery row.
- A simulated OneSignal timeout retries without producing a duplicate provider message.
- A reminder overdue by more than five minutes is skipped and advanced.

### Phase 7: Operational hardening

1. Log delivery counts, failures, and skipped reminders.
2. Add health monitoring for scheduler execution.
3. Alert if no scheduler execution occurs for several minutes.
4. Add a manual replay command for failed deliveries.

This phase is required before relying on reminders as a production feature.

## 12. Deferred Work

Do not implement these in the initial rollout:

- BullMQ or Redis Streams.
- A separate notification microservice.
- Stored streak counters.
- Exact future notification instances.
- Nutrition, calories, water, steps, or sleep automation without source tables.
- Target history unless historical stats must remain frozen after target edits.
- Event-level habit logs unless the UI needs individual activity entries.

## 13. Approval Checklist

Before implementation, confirm:

- Cron-only reminder delivery is acceptable for the Pump MVP.
- The deployment platform can run `bun run reminders:dispatch` every minute.
- Habit logs should remain daily summaries rather than event records.
- Historical completion should be recalculated using the current habit target for the MVP.
- Existing reminders should not automatically change timezone when the user travels.

## 14. OneSignal References

- [Create Message API](https://documentation.onesignal.com/reference/create-message)
- [Idempotent API Requests](https://documentation.onesignal.com/reference/idempotent-notification-requests)
- [REST API Overview](https://documentation.onesignal.com/reference/rest-api-overview)

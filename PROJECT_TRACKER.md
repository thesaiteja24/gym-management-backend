# 🚀 Project Tracker: PUMP (Gym Management Architect)

This document serves as the **single source of truth** for the project's roadmap, current status, technical architectural decisions, and known challenges.

---

## � Phase 1: Core Offline-First Experience (COMPLETED)

**Goal:** Build a robust, specialized workout logger that functions 100% perfectly without an internet connection. The "Core Loop" (Start -> Log -> Save -> Sync) must be bulletproof.

### ✅ Completed Features

#### 1. Offline Sync Engine (The Backbone)

- [x] **Mutation Queue**: Implemented using `react-native-mmkv`. Stores actions (`CREATE_WORKOUT`, `EDIT_WORKOUT`) persistently.
- [x] **Sync Service**: Background service that processes the queue when online.
- [x] **Network Awareness**: `NetInfo` integration to auto-trigger sync on reconnection.
- [x] **Retry Logic**: Basic exponential backoff/retry for failed mutations.

#### 2. Workout Execution & Logging

- [x] **Active Workout State**: Zustand store managing complex state (sets, reps, timers, rest).
- [x] **Live Timer**: Wall-clock duration tracking.
- [x] **Complex Sets**: Support for Warmup, Drop Sets, Failure Sets, and RPE.
- [x] **Auto-Rest Timer**: Triggers automatically upon set completion.
- [x] **Supersets/Index logic**: Groups exercises together logic.

#### 3. History & Editing (The "Unified" Flow)

- [x] **History List**: Infinite scroll list of past workouts.
- [x] **Editing**: Reuses the `start.tsx` active workout UI for editing past logs.
    - _Logic_: Loads history -> Hydrates Store -> User Edits -> Queues `EDIT_WORKOUT` mutation.
    - _UI_: Displays "Edited" badge and switch to "Accumulated Time" (static) mode.
- [x] **Deletion**: Optimistic UI updates with offline queue support.

### 🧠 Challenges & Edge Cases Solved

| Challenge                     | Solution Implemented                                                                                                                                                                                     |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Active Workout Overwrites** | When a user tries to _Edit_ a past workout while a _Live_ workout is running, we added an **Alert Guard** to prevent accidental data loss ("Discard current workout?").                                  |
| **Serialization Validation**  | The Backend rejected `null` for optional fields (`exerciseGroupId`) and `string` for metrics (`weight`). We updated `serializeWorkoutForApi` to **strictly omit** nulls and `Number()` cast all metrics. |
| **History Refresh**           | `saveWorkout` creates a change but the History list (fetched via API) wouldn't know. We added a manual `getAllWorkouts()` refetch trigger upon successful save/sync to keep UI consistent.               |
| **Editing Timestamp**         | Editing a past workout shouldn't reset its `endTime` to "now". We added logic to preserve original timestamps during the hydration phase.                                                                |

---

## 🟡 Phase 2: Templates & Architecture Refactor (COMPLETED)

**Goal:** Reduce friction for starting workouts and harden the offline sync architecture.

### ✅ Completed Features

#### 1. Workout Templates (Routines)

- [x] **Create/Edit Template**: "Save as Template" from history or create from scratch with full editing capabilities.
- [x] **Start from Template**: Hydrates the Active Workout store with exercises/sets from the template.
- [x] **Template Validation**: Smart pruning of invalid groups and exercises during save.
- [x] **Draft System**: Local draft state for robust template editing.

#### 2. Architecture V2 (Refactored Sync)

- [x] **Split Sync Queues**: Decoupled `workoutQueue` and `templateQueue` for better isolation and performance.
- [x] **ID Reconciliation**: Solved the `clientId` (local) vs `dbId` (backend) mapping problem using a reconciler.
- [x] **Robust Retry Logic**: Exponential backoff with `MAX_RETRIES` (3) and automatic move to "Failed Queue".
- [x] **Debounced Auto-Sync**: Reactive sync triggering based on queue events.

### 🧠 Challenges Solved

| Challenge             | Solution Implemented                                                                                                                                                  |
| :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID Mismatch**       | Created a `reconciler` module to map temporary local UUIDs to permanent Backend UUIDs after a successful sync, ensuring subsequent updates target the correct record. |
| **Invalid Templates** | Implemented `prepareTemplateForSave` to automatically strip empty groups or invalid exercises before submission, preventing backend 400 errors.                       |

---

## 🔵 Phase 3: Analytics & Ecosystem (FUTURE)

**Goal:** Transform the tool from a "Logger" to a "Coach" and provide deep insights.

### 📊 3.1 Analytics & Charts

- [ ] **Volume Charts**: Line graph showing tonnage over time.
- [ ] **Frequency Tracker**: Calendar heat map (GitHub style) of workouts.
- [ ] **1RM Estimation**: Epley formula implementation for key lifts.
- [ ] **Muscle Split Breakdown**: Pie chart of sets per muscle group.

### 🚀 3.2 Advanced Features

- [ ] **Folder/Tag System**: Organize templates (Push/Pull/Legs).
- [ ] **Social**: Feed of friends' workouts, reactions.
- [ ] **Coaching Portal**: Web dashboard for trainers.
- [ ] **AI Insights**: LLM-based analysis of workout logs.

---

## 🛠 Tech Stack Status

### Backend (`gym-management-backend`)

- **Validation**: Centralized Zod Middleware (Robust).
- **Controllers**: converted to TypeScript, sanitized.
- **Database**: Prisma + PostgreSQL. Schema stabilized for Offline Sync.

### Frontend (`gym-management-expo`)

- **State**: Zustand (Split into `activeWorkoutSlice`, `historySlice`, `exerciseStore`).
- **Storage**: MMKV (High performance) for Offline Queue.
- **UI**: NativeWind (Tailwind) + Reanimated.
- **Navigation**: Expo Router.

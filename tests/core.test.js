import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_SCOPE,
  EVENT_CATEGORIES,
  HOME_CATEGORIES,
  PROJECT_TYPES,
  buildGoogleCalendarUrl,
  completeDailyQuest,
  completePhysicalQuest,
  createDefaultHome,
  createDefaultPersonal,
  defaultVisibilityForCategory,
  eventCollectionPath,
  isActiveMemberSnapshot,
  levelForXp,
  markTrailFinderComplete,
  nextStreak,
  normalizePersonal,
  personalStatePath,
  recordRecovery,
  sanitizeEvent,
  sharedHomePath,
  toGoogleCalendarResource,
  toggleDailyTask,
  weekKey,
  xpWithinLevel,
} from '../app.js';

function readyDailyQuest(day = '2026-08-22') {
  let state = createDefaultPersonal(day);
  for (const task of state.dailyQuest.tasks) state = toggleDailyTask(state, task.id, true, day);
  return state;
}

test('Daily Quest awards XP, a clear, stats, and history exactly once', () => {
  const ready = readyDailyQuest();
  const cleared = completeDailyQuest(ready, '2026-08-22');
  assert.equal(cleared.xp, 100);
  assert.equal(cleared.questClears, 1);
  assert.equal(cleared.streak, 1);
  assert.equal(cleared.stats.focus, 2);
  assert.equal(cleared.stats.discipline, 2);
  assert.equal(cleared.questHistory.length, 1);
  assert.equal(completeDailyQuest(cleared, '2026-08-22').xp, 100);
});

test('Daily Quest resets on a new day without losing personal history', () => {
  const cleared = completeDailyQuest(readyDailyQuest('2026-08-22'), '2026-08-22');
  const tomorrow = normalizePersonal(cleared, '2026-08-23');
  assert.equal(tomorrow.dailyQuest.completed, false);
  assert.ok(tomorrow.dailyQuest.tasks.every((task) => !task.checked));
  assert.equal(tomorrow.questHistory.length, 1);
});

test('XP and level thresholds are exact and monotonic', () => {
  assert.equal(levelForXp(-5), 1);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(799), 1);
  assert.equal(levelForXp(800), 2);
  assert.equal(levelForXp(1600), 3);
  assert.equal(xpWithinLevel(1640), 40);
});

test('streak increments only on consecutive calendar days and resets after a gap', () => {
  assert.equal(nextStreak('', '2026-08-22', 0), 1);
  assert.equal(nextStreak('2026-08-22', '2026-08-22', 6), 6);
  assert.equal(nextStreak('2026-08-21', '2026-08-22', 6), 7);
  assert.equal(nextStreak('2026-08-20', '2026-08-22', 6), 1);
});

test('Physical Quest progression and stats remain personal', () => {
  const before = createDefaultPersonal('2026-08-22');
  const after = completePhysicalQuest(before, { title: 'Test circuit', minutes: 20 }, new Date('2026-08-22T18:00:00Z'));
  assert.equal(after.xp, 75);
  assert.equal(after.stats.vitality, 2);
  assert.equal(after.stats.endurance, 3);
  assert.equal(after.physicalProgression.sessions, 1);
  assert.equal(after.physicalProgression.totalMinutes, 20);
  assert.equal(after.questHistory[0].type, 'Physical Quest');
});

test('Recovery appends private history and increases Vitality', () => {
  const first = recordRecovery(createDefaultPersonal('2026-08-22'), 'Stretch', new Date('2026-08-22T18:00:00Z'));
  const second = recordRecovery(first, 'Breathwork', new Date('2026-08-22T19:00:00Z'));
  assert.equal(second.recoveryHistory.length, 2);
  assert.equal(second.stats.vitality, 3);
  assert.throws(() => recordRecovery(second, 'Unknown'));
});

test('home schedule and project types expose every required lane', () => {
  assert.deepEqual(HOME_CATEGORIES, ['Edit', 'Cook', 'Decorate', 'Clean']);
  assert.deepEqual(Object.keys(createDefaultHome().schedule), HOME_CATEGORIES);
  assert.deepEqual(PROJECT_TYPES, ['Edit', 'Cook', 'Decorate', 'Clean', 'Home']);
});

test('personal, household, private, and shared storage paths are isolated', () => {
  assert.equal(personalStatePath('alice'), 'users/alice/state/main');
  assert.equal(personalStatePath('bob'), 'users/bob/state/main');
  assert.notEqual(personalStatePath('alice'), personalStatePath('bob'));
  assert.equal(sharedHomePath(), 'households/pepperpots/state/home');
  assert.equal(eventCollectionPath('alice', 'PRIVATE'), 'users/alice/events');
  assert.equal(eventCollectionPath('bob', 'PRIVATE'), 'users/bob/events');
  assert.equal(eventCollectionPath('alice', 'SHARED'), 'households/pepperpots/events');
});

test('Doctor events default private and event enums are complete', () => {
  assert.equal(defaultVisibilityForCategory('Doctor', 'SHARED'), 'PRIVATE');
  assert.equal(defaultVisibilityForCategory('Work', 'SHARED'), 'SHARED');
  assert.deepEqual(EVENT_CATEGORIES, ['Work', 'Doctor', 'Appointment', 'Personal', 'Home', 'Family', 'Other']);
  const event = sanitizeEvent({ title: 'Checkup', category: 'Doctor', date: '2026-09-01', visibility: 'SHARED' }, 'alice');
  assert.equal(event.visibility, 'PRIVATE');
  assert.equal(event.ownerUid, 'alice');
});

test('Calendar fallback is pre-filled and uses the required event scope', () => {
  const event = sanitizeEvent({
    title: 'Home planning', category: 'Home', date: '2026-09-01',
    startTime: '18:00', endTime: '19:00', location: 'Kitchen', notes: 'Plan the week',
    reminder: '30_MINUTES', repeat: 'WEEKLY', visibility: 'SHARED',
  }, 'alice');
  const url = new URL(buildGoogleCalendarUrl(event));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Home planning');
  assert.match(url.searchParams.get('dates'), /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  assert.equal(url.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY');
  assert.equal(CALENDAR_SCOPE, 'https://www.googleapis.com/auth/calendar.events.owned');
  const resource = toGoogleCalendarResource(event);
  assert.equal(resource.summary, event.title);
  assert.deepEqual(resource.recurrence, ['RRULE:FREQ=WEEKLY']);
  assert.equal(resource.reminders.overrides[0].minutes, 30);
  const defaultDuration = toGoogleCalendarResource({ ...event, endTime: '' });
  assert.notEqual(defaultDuration.start.dateTime, defaultDuration.end.dateTime);
});

test('Weekly Trail Finder stores only a week completion marker', () => {
  const now = new Date('2026-08-22T18:00:00Z');
  const state = markTrailFinderComplete(createDefaultPersonal('2026-08-22'), now);
  assert.deepEqual(state.weeklyTrailFinder, { week: weekKey(now), completed: true });
});

test('only an existing active member snapshot passes approval', () => {
  assert.equal(isActiveMemberSnapshot({ exists: () => true, data: () => ({ active: true }) }), true);
  assert.equal(isActiveMemberSnapshot({ exists: () => true, data: () => ({ active: false }) }), false);
  assert.equal(isActiveMemberSnapshot({ exists: () => false, data: () => ({ active: true }) }), false);
  assert.equal(isActiveMemberSnapshot(null), false);
});

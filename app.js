/* global window, document, navigator, crypto, fetch, FormData, URLSearchParams, HTMLElement */
import { PEPPERPOTS_CONFIG, isFirebaseConfigured } from './config.js';

export const XP_PER_LEVEL = 800;
export const HOUSEHOLD_ID = 'pepperpots';
export const HOME_CATEGORIES = Object.freeze(['Edit', 'Cook', 'Decorate', 'Clean']);
export const PROJECT_TYPES = Object.freeze(['Edit', 'Cook', 'Decorate', 'Clean', 'Home']);
export const EVENT_CATEGORIES = Object.freeze(['Work', 'Doctor', 'Appointment', 'Personal', 'Home', 'Family', 'Other']);
export const EVENT_VISIBILITIES = Object.freeze(['PRIVATE', 'SHARED']);
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

const DAILY_TASKS = Object.freeze([
  { id: 'move', label: 'Move for at least 20 minutes' },
  { id: 'reset', label: 'Reset one visible home surface' },
  { id: 'focus', label: 'Finish one focused 25-minute block' },
]);

const PHYSICAL_QUESTS = Object.freeze([
  { title: 'Foundation circuit', detail: '3 rounds · 10 squats · 8 incline pushups · 30-sec plank', minutes: 18 },
  { title: 'Power walk', detail: '30 brisk minutes · finish with five slow breaths', minutes: 30 },
  { title: 'Mobility ladder', detail: 'Hips · shoulders · hamstrings · 45 seconds each', minutes: 15 },
]);

const mountedRoots = new WeakMap();

export function dateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function previousDateKey(value) {
  const current = new Date(`${dateKey(value)}T12:00:00`);
  current.setDate(current.getDate() - 1);
  return dateKey(current);
}

export function levelForXp(xp) {
  const safeXp = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  return Math.floor(safeXp / XP_PER_LEVEL) + 1;
}

export function xpWithinLevel(xp) {
  const safeXp = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  return safeXp % XP_PER_LEVEL;
}

export function nextStreak(lastClearDate, today, currentStreak = 0) {
  const currentDay = dateKey(today);
  if (!lastClearDate) return 1;
  if (lastClearDate === currentDay) return Math.max(1, Number(currentStreak) || 1);
  return lastClearDate === previousDateKey(currentDay) ? Math.max(0, Number(currentStreak) || 0) + 1 : 1;
}

export function createDefaultPersonal(today = dateKey()) {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    questClears: 0,
    lastQuestClearDate: '',
    stats: { vitality: 1, endurance: 1, focus: 1, discipline: 1 },
    dailyQuest: {
      date: dateKey(today),
      completed: false,
      tasks: DAILY_TASKS.map((task) => ({ ...task, checked: false })),
    },
    questHistory: [],
    recoveryHistory: [],
    physicalProgression: { sessions: 0, totalMinutes: 0, lastCompletedAt: '' },
    weeklyTrailFinder: { week: '', completed: false },
  };
}

export function createDefaultHome() {
  return {
    schedule: Object.fromEntries(HOME_CATEGORIES.map((category) => [category, []])),
    projectQueue: [],
  };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

export function normalizePersonal(raw = {}, today = dateKey()) {
  const defaults = createDefaultPersonal(today);
  const sameDay = raw?.dailyQuest?.date === dateKey(today);
  const tasks = sameDay && Array.isArray(raw.dailyQuest.tasks)
    ? DAILY_TASKS.map((task) => ({ ...task, checked: Boolean(raw.dailyQuest.tasks.find((item) => item.id === task.id)?.checked) }))
    : defaults.dailyQuest.tasks;
  const xp = safeNumber(raw.xp, defaults.xp);

  return {
    ...defaults,
    xp,
    level: levelForXp(xp),
    streak: safeNumber(raw.streak, defaults.streak),
    questClears: safeNumber(raw.questClears, defaults.questClears),
    lastQuestClearDate: typeof raw.lastQuestClearDate === 'string' ? raw.lastQuestClearDate : '',
    stats: {
      vitality: safeNumber(raw?.stats?.vitality, 1),
      endurance: safeNumber(raw?.stats?.endurance, 1),
      focus: safeNumber(raw?.stats?.focus, 1),
      discipline: safeNumber(raw?.stats?.discipline, 1),
    },
    dailyQuest: {
      date: dateKey(today),
      completed: sameDay ? Boolean(raw.dailyQuest.completed) : false,
      tasks,
    },
    questHistory: Array.isArray(raw.questHistory) ? raw.questHistory.slice(-60) : [],
    recoveryHistory: Array.isArray(raw.recoveryHistory) ? raw.recoveryHistory.slice(-60) : [],
    physicalProgression: {
      sessions: safeNumber(raw?.physicalProgression?.sessions),
      totalMinutes: safeNumber(raw?.physicalProgression?.totalMinutes),
      lastCompletedAt: typeof raw?.physicalProgression?.lastCompletedAt === 'string' ? raw.physicalProgression.lastCompletedAt : '',
    },
    weeklyTrailFinder: {
      week: typeof raw?.weeklyTrailFinder?.week === 'string' ? raw.weeklyTrailFinder.week : '',
      completed: Boolean(raw?.weeklyTrailFinder?.completed),
    },
  };
}

export function normalizeHome(raw = {}) {
  const defaults = createDefaultHome();
  return {
    schedule: Object.fromEntries(HOME_CATEGORIES.map((category) => [
      category,
      Array.isArray(raw?.schedule?.[category]) ? raw.schedule[category].slice(-100) : defaults.schedule[category],
    ])),
    projectQueue: Array.isArray(raw.projectQueue) ? raw.projectQueue.slice(-100) : [],
  };
}

export function toggleDailyTask(personal, taskId, checked, today = dateKey()) {
  const next = normalizePersonal(personal, today);
  if (next.dailyQuest.completed) return next;
  next.dailyQuest.tasks = next.dailyQuest.tasks.map((task) => task.id === taskId ? { ...task, checked: Boolean(checked) } : task);
  return next;
}

export function completeDailyQuest(personal, today = dateKey()) {
  const next = normalizePersonal(personal, today);
  if (next.dailyQuest.completed || !next.dailyQuest.tasks.every((task) => task.checked)) return next;
  const day = dateKey(today);
  next.xp += 100;
  next.level = levelForXp(next.xp);
  next.streak = nextStreak(next.lastQuestClearDate, day, next.streak);
  next.questClears += 1;
  next.lastQuestClearDate = day;
  next.stats.focus += 1;
  next.stats.discipline += 1;
  next.dailyQuest.completed = true;
  next.questHistory = [...next.questHistory, { id: `daily-${day}`, type: 'Daily Quest', date: day, xp: 100 }].slice(-60);
  return next;
}

export function completePhysicalQuest(personal, quest = PHYSICAL_QUESTS[0], now = new Date()) {
  const next = normalizePersonal(personal, dateKey(now));
  next.xp += 75;
  next.level = levelForXp(next.xp);
  next.stats.vitality += 1;
  next.stats.endurance += 2;
  next.physicalProgression.sessions += 1;
  next.physicalProgression.totalMinutes += safeNumber(quest.minutes);
  next.physicalProgression.lastCompletedAt = now.toISOString();
  next.questHistory = [...next.questHistory, {
    id: makeId('physical'),
    type: 'Physical Quest',
    title: quest.title,
    date: dateKey(now),
    xp: 75,
  }].slice(-60);
  return next;
}

export function recordRecovery(personal, activity, now = new Date()) {
  const allowed = ['Breathwork', 'Stretch', 'Walk', 'Early night'];
  if (!allowed.includes(activity)) throw new Error('Unknown recovery activity.');
  const next = normalizePersonal(personal, dateKey(now));
  next.stats.vitality += 1;
  next.recoveryHistory = [...next.recoveryHistory, {
    id: makeId('recovery'),
    activity,
    date: dateKey(now),
    recordedAt: now.toISOString(),
  }].slice(-60);
  return next;
}

export function weekKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return dateKey(date);
}

export function markTrailFinderComplete(personal, now = new Date()) {
  const next = normalizePersonal(personal, dateKey(now));
  next.weeklyTrailFinder = { week: weekKey(now), completed: true };
  return next;
}

export function defaultVisibilityForCategory(category, current = 'PRIVATE') {
  return category === 'Doctor' ? 'PRIVATE' : (EVENT_VISIBILITIES.includes(current) ? current : 'PRIVATE');
}

export function personalStatePath(uid) {
  if (!uid) throw new Error('A Firebase UID is required.');
  return `users/${uid}/state/main`;
}

export function sharedHomePath(householdId = HOUSEHOLD_ID) {
  return `households/${householdId}/state/home`;
}

export function eventCollectionPath(uid, visibility, householdId = HOUSEHOLD_ID) {
  if (visibility === 'PRIVATE') {
    if (!uid) throw new Error('A Firebase UID is required for private events.');
    return `users/${uid}/events`;
  }
  if (visibility === 'SHARED') return `households/${householdId}/events`;
  throw new Error('Unknown event visibility.');
}

export function sanitizeEvent(input, uid) {
  const category = EVENT_CATEGORIES.includes(input.category) ? input.category : 'Other';
  const visibility = defaultVisibilityForCategory(category, input.visibility);
  const title = String(input.title ?? '').trim();
  const date = String(input.date ?? '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Title and date are required.');
  return {
    ownerUid: uid,
    title: title.slice(0, 160),
    category,
    date,
    startTime: String(input.startTime ?? ''),
    endTime: String(input.endTime ?? ''),
    location: String(input.location ?? '').trim().slice(0, 300),
    notes: String(input.notes ?? '').trim().slice(0, 3000),
    reminder: ['NONE', '10_MINUTES', '30_MINUTES', '1_HOUR', '1_DAY'].includes(input.reminder) ? input.reminder : 'NONE',
    repeat: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(input.repeat) ? input.repeat : 'NONE',
    visibility,
  };
}

function compactCalendarDate(date, time = '') {
  if (!time) return date.replaceAll('-', '');
  return new Date(`${date}T${time}:00`).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
}

function resolvedEventEnd(event) {
  const start = new Date(`${event.date}T${event.startTime || '00:00'}:00`);
  if (event.endTime) {
    const selectedEnd = new Date(`${event.date}T${event.endTime}:00`);
    if (selectedEnd > start) return selectedEnd;
  }
  start.setHours(start.getHours() + 1);
  return start;
}

function localDateTimeString(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dateKey(date)}T${hours}:${minutes}:00`;
}

export function buildGoogleCalendarUrl(event, endpoint = PEPPERPOTS_CONFIG.googleCalendar.fallbackEndpoint) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.notes || `Created with PEPPERPOTS · ${event.category}`,
    location: event.location || '',
  });
  const start = compactCalendarDate(event.date, event.startTime);
  let end;
  if (event.startTime) end = resolvedEventEnd(event).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
  else {
    const next = new Date(`${event.date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    end = dateKey(next).replaceAll('-', '');
  }
  params.set('dates', `${start}/${end}`);
  if (event.repeat !== 'NONE') params.set('recur', `RRULE:FREQ=${event.repeat}`);
  return `${endpoint}?${params.toString()}`;
}

export function toGoogleCalendarResource(event) {
  const hasTime = Boolean(event.startTime);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const start = hasTime ? { dateTime: `${event.date}T${event.startTime}:00`, timeZone } : { date: event.date };
  let end;
  if (hasTime) {
    end = { dateTime: localDateTimeString(resolvedEventEnd(event)), timeZone };
  } else {
    const endDate = new Date(`${event.date}T12:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    end = { date: dateKey(endDate) };
  }
  const reminderMinutes = { '10_MINUTES': 10, '30_MINUTES': 30, '1_HOUR': 60, '1_DAY': 1440 }[event.reminder];
  return {
    summary: event.title,
    description: event.notes || `Created with PEPPERPOTS · ${event.category}`,
    location: event.location || '',
    start,
    end,
    recurrence: event.repeat === 'NONE' ? undefined : [`RRULE:FREQ=${event.repeat}`],
    reminders: reminderMinutes ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMinutes }] } : { useDefault: true },
  };
}

export function containsTrailLocationData(value) {
  const forbidden = /^(latitude|longitude|coordinates|locationhistory|routehistory|routes)$/i;
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => forbidden.test(key) || containsTrailLocationData(nested));
}

export function requestTrailLocation({ geolocation, onResolved, onDenied }) {
  if (!geolocation?.getCurrentPosition) {
    onDenied?.();
    return false;
  }
  geolocation.getCurrentPosition(
    () => onResolved?.(),
    () => onDenied?.(),
    { enableHighAccuracy: false, maximumAge: 0, timeout: 8000 },
  );
  return true;
}

function makeId(prefix = 'item') {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatShortDate(value) {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
}

function initials(name = 'PP') {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PP';
}

const APP_SHELL = `
  <main class="pp-shell">
    <section class="pp-access" data-access-screen>
      <div class="pp-access-art">
        <a class="pp-brand" href="#">PEPPER<span>POTS</span></a>
        <div class="pp-access-copy">
          <p class="pp-eyebrow">PRIVATE · SHARED · IN SYNC</p>
          <h1>BUILD<br><span>THE LIFE.</span></h1>
          <p>One focused home system for two approved people—personal progress stays personal, while plans, projects, and shared events move together.</p>
        </div>
      </div>
      <div class="pp-access-panel">
        <p class="pp-eyebrow">MEMBER ACCESS</p>
        <h2>Your shared world.<br>Your private progress.</h2>
        <p>Sign in with Google. Access is granted only when your Firebase UID is active in the private Pepperpots member list.</p>
        <div class="pp-access-rule"></div>
        <button class="pp-button pp-button--wide" type="button" data-sign-in>Continue with Google <span class="pp-button__arrow">→</span></button>
        <button class="pp-button pp-button--ghost pp-button--wide" type="button" data-demo hidden>Open configuration-safe preview</button>
        <p class="pp-access-note" data-access-status role="status">Checking secure cloud configuration…</p>
      </div>
    </section>

    <section class="pp-app" data-app hidden>
      <header class="pp-header">
        <nav class="pp-desktop-nav" aria-label="Primary">
          <button class="pp-nav-button is-active" data-view-target="today" type="button">Today</button>
          <button class="pp-nav-button" data-view-target="home" type="button">Home</button>
          <button class="pp-nav-button" data-view-target="calendar" type="button">Calendar</button>
          <button class="pp-nav-button" data-view-target="progress" type="button">Progress</button>
        </nav>
        <a class="pp-brand" href="#today" data-view-link="today">PEPPER<span>POTS</span></a>
        <div class="pp-account">
          <div class="pp-account-meta"><strong data-member-name>Member</strong><small>Private profile</small></div>
          <button class="pp-avatar" type="button" data-sign-out aria-label="Sign out">PP</button>
        </div>
      </header>
      <div class="pp-sync-strip"><span class="pp-sync-dot" data-sync-dot></span><span data-sync-label>Cloud sync ready</span></div>

      <section class="pp-view is-active" data-view="today">
        <div class="pp-hero">
          <div><p class="pp-eyebrow" data-today-label></p><h1 class="pp-title">BUILD THE LIFE.<br><em>KEEP THE STREAK.</em></h1></div>
          <div class="pp-level-orbit"><span>Level</span><strong data-level>01</strong><small data-xp-label>0 / 800 XP</small></div>
        </div>
        <div class="pp-today-grid">
          <article class="pp-daily-card">
            <div class="pp-card-head"><div><p class="pp-eyebrow">DAILY QUEST</p><h2>Three moves.<br>One clear.</h2></div><span class="pp-xp-chip">+100 XP</span></div>
            <div class="pp-quest-list" data-daily-tasks></div>
            <button class="pp-button" type="button" data-clear-quest>Clear daily quest <span class="pp-button__arrow">→</span></button>
          </article>
          <aside class="pp-streak-card">
            <p class="pp-eyebrow">CURRENT STREAK</p><div class="pp-streak-number" data-streak>00</div><div class="pp-streak-label">DAYS IN MOTION</div><div class="pp-week-dots" data-week-dots></div>
          </aside>
        </div>
        <div class="pp-stats" data-stats></div>
        <div class="pp-feature-grid">
          <article class="pp-feature pp-feature--dark"><span class="pp-feature-number">01 · PHYSICAL QUEST</span><h3 data-physical-title>Foundation circuit</h3><p data-physical-detail></p><button class="pp-button pp-button--pink" type="button" data-physical-complete>Complete · +75 XP</button></article>
          <article class="pp-feature"><span class="pp-feature-number">02 · WEEKLY TRAIL FINDER</span><h3>Find the next path.</h3><p>Location is requested only after you tap. Coordinates, routes, and location history are never sent to Firebase or written to this project.</p><button class="pp-button" type="button" data-trail-finder>Find trails near me <span class="pp-button__arrow">→</span></button></article>
          <article class="pp-feature pp-feature--pink"><span class="pp-feature-number">03 · RECOVERY</span><h3>Recovery counts.</h3><p>Log one deliberate reset. This stays in your private recovery history.</p><div class="pp-recovery-actions"><button type="button" data-recovery="Breathwork">Breathwork</button><button type="button" data-recovery="Stretch">Stretch</button><button type="button" data-recovery="Walk">Walk</button><button type="button" data-recovery="Early night">Early night</button></div><div class="pp-reward">7-DAY REWARD<br>Smoke<br>Ghost<br>game time</div></article>
        </div>
      </section>

      <section class="pp-view" data-view="home">
        <div class="pp-page-pad">
          <div class="pp-section-head"><div><p class="pp-eyebrow">PEPPERPOTS HOME SYSTEM</p><h1 class="pp-section-title">One home.<br>Four active lanes.</h1><p class="pp-subtitle">EDIT, COOK, DECORATE, and CLEAN share one realtime schedule for both approved members.</p></div></div>
          <div class="pp-category-grid" data-schedule-grid></div>
          <section class="pp-panel">
            <div class="pp-panel-head"><h3>Add to the shared schedule</h3><span>Both members see it</span></div>
            <form class="pp-form" data-schedule-form>
              <div class="pp-field pp-field--2"><label for="schedule-type">Category</label><select id="schedule-type" name="category" required>${HOME_CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select></div>
              <div class="pp-field pp-field--4"><label for="schedule-title">Title</label><input id="schedule-title" name="title" maxlength="160" required placeholder="What needs a spot?" /></div>
              <div class="pp-field pp-field--2"><label for="schedule-date">Date</label><input id="schedule-date" name="date" type="date" required /></div>
              <div class="pp-field pp-field--4"><label for="schedule-note">Note</label><input id="schedule-note" name="note" maxlength="500" placeholder="Optional detail" /></div>
              <div class="pp-form-actions"><button class="pp-button" type="submit">Add to schedule</button></div>
            </form>
          </section>
          <section class="pp-panel">
            <div class="pp-panel-head"><h3>Future Project Queue</h3><span>Shared · realtime</span></div>
            <div class="pp-projects" data-project-list></div>
            <form class="pp-form" data-project-form>
              <div class="pp-field pp-field--4"><label for="project-title">Title</label><input id="project-title" name="title" maxlength="160" required placeholder="Future project" /></div>
              <div class="pp-field pp-field--2"><label for="project-type">Type</label><select id="project-type" name="type" required>${PROJECT_TYPES.map((type) => `<option>${type}</option>`).join('')}</select></div>
              <div class="pp-field pp-field--2"><label for="project-target">Target</label><input id="project-target" name="target" maxlength="160" placeholder="Goal or room" /></div>
              <div class="pp-field pp-field--2"><label for="project-date">Date</label><input id="project-date" name="date" type="date" /></div>
              <div class="pp-field pp-field--12"><label for="project-note">Note</label><textarea id="project-note" name="note" maxlength="1000" placeholder="The idea, ingredients, measurements, or next move"></textarea></div>
              <div class="pp-form-actions"><button class="pp-button" type="submit">Add future project</button></div>
            </form>
          </section>
        </div>
      </section>

      <section class="pp-view" data-view="calendar">
        <div class="pp-calendar-hero">
          <div class="pp-calendar-intro"><p class="pp-eyebrow">CALENDAR</p><h1 class="pp-section-title">Private when it should be.<br><span style="color:var(--pink)">Shared when it matters.</span></h1><p class="pp-subtitle">Private events live only under your UID. Shared events sync to the Pepperpots household for both approved members.</p></div>
          <aside class="pp-calendar-connect"><p class="pp-eyebrow" style="color:var(--ink)">OPTIONAL CONNECTION</p><h2>Google Calendar</h2><p>Create events directly with the event-only OAuth scope. Tokens remain in memory and are never committed or stored in Firebase.</p><button class="pp-button pp-button--white" type="button" data-connect-calendar>Connect Google Calendar</button><small data-calendar-status>Not connected · safe fallback available</small></aside>
        </div>
        <div class="pp-page-pad">
          <section class="pp-panel" style="margin-top:0">
            <div class="pp-panel-head"><h3>Create event</h3><span>Choose private or shared</span></div>
            <form class="pp-form" data-event-form>
              <div class="pp-field pp-field--4"><label for="event-title">Title</label><input id="event-title" name="title" maxlength="160" required /></div>
              <div class="pp-field pp-field--2"><label for="event-category">Category</label><select id="event-category" name="category" required>${EVENT_CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select></div>
              <div class="pp-field pp-field--2"><label for="event-date">Date</label><input id="event-date" name="date" type="date" required /></div>
              <div class="pp-field pp-field--2"><label for="event-start">Start time</label><input id="event-start" name="startTime" type="time" /></div>
              <div class="pp-field pp-field--2"><label for="event-end">End time</label><input id="event-end" name="endTime" type="time" /></div>
              <div class="pp-field pp-field--4"><label for="event-location">Location</label><input id="event-location" name="location" maxlength="300" /></div>
              <div class="pp-field pp-field--2"><label for="event-reminder">Reminder</label><select id="event-reminder" name="reminder"><option value="NONE">None</option><option value="10_MINUTES">10 minutes</option><option value="30_MINUTES">30 minutes</option><option value="1_HOUR">1 hour</option><option value="1_DAY">1 day</option></select></div>
              <div class="pp-field pp-field--2"><label for="event-repeat">Repeat</label><select id="event-repeat" name="repeat"><option value="NONE">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></div>
              <div class="pp-field pp-field--4"><label for="event-visibility">Visibility</label><select id="event-visibility" name="visibility"><option value="PRIVATE">PRIVATE · only me</option><option value="SHARED">SHARED · both members</option></select><div class="pp-privacy-tip" data-doctor-tip hidden>Doctor appointments default to PRIVATE.</div></div>
              <div class="pp-field pp-field--12"><label for="event-notes">Notes</label><textarea id="event-notes" name="notes" maxlength="3000"></textarea></div>
              <div class="pp-form-actions"><button class="pp-button pp-button--ghost" type="submit" value="pepperpots">SAVE TO PEPPERPOTS</button><button class="pp-button pp-button--pink" type="submit" value="google">SAVE + GOOGLE CALENDAR</button></div>
            </form>
          </section>
          <div class="pp-event-columns"><section class="pp-event-column"><h3>Private · only you</h3><div data-private-events></div></section><section class="pp-event-column pp-event-column--shared"><h3>Shared · both members</h3><div data-shared-events></div></section></div>
        </div>
      </section>

      <section class="pp-view" data-view="progress">
        <div class="pp-progress-hero"><p class="pp-eyebrow" style="color:var(--ink)">PERSONAL PROGRESSION</p><h1 class="pp-section-title">Your effort.<br>Your record.</h1><p class="pp-subtitle" style="color:#3b1530">XP, stats, streak, recovery, quests, and physical progression are isolated under your Firebase UID.</p></div>
        <div class="pp-stats" data-progress-stats></div>
        <div class="pp-page-pad"><div class="pp-history-grid"><article class="pp-history-card"><h3>QUEST CLEARS</h3><ul class="pp-history-list" data-quest-history></ul></article><article class="pp-history-card"><h3>RECOVERY HISTORY</h3><ul class="pp-history-list" data-recovery-history></ul></article><article class="pp-history-card"><h3>PHYSICAL PROGRESSION</h3><ul class="pp-history-list" data-physical-progress></ul></article></div></div>
      </section>

      <nav class="pp-mobile-nav" aria-label="Primary mobile navigation">
        <button class="pp-nav-button is-active" data-view-target="today" type="button">Today</button><button class="pp-nav-button" data-view-target="home" type="button">Home</button><button class="pp-nav-button" data-view-target="calendar" type="button">Calendar</button><button class="pp-nav-button" data-view-target="progress" type="button">Progress</button>
      </nav>
    </section>
    <div class="pp-toast" role="status" aria-live="polite" data-toast hidden></div>
  </main>`;

export function mountPepperpots(root) {
  if (!(root instanceof HTMLElement)) throw new Error('Pepperpots needs a valid root element.');
  mountedRoots.get(root)?.();
  root.innerHTML = APP_SHELL;

  const query = (selector) => root.querySelector(selector);
  const queryAll = (selector) => [...root.querySelectorAll(selector)];
  const controller = new AbortController();
  const { signal } = controller;
  const model = {
    user: null,
    personal: createDefaultPersonal(),
    home: createDefaultHome(),
    privateEvents: [],
    sharedEvents: [],
    store: null,
    firebase: null,
    auth: null,
    unsubscribeData: null,
    unsubscribeAuth: null,
    calendarAccessToken: null,
    demo: false,
    activeView: 'today',
  };

  const accessScreen = query('[data-access-screen]');
  const appScreen = query('[data-app]');
  const status = query('[data-access-status]');
  const toast = query('[data-toast]');

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.hidden = false;
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function showView(view) {
    if (!['today', 'home', 'calendar', 'progress'].includes(view)) return;
    model.activeView = view;
    queryAll('[data-view]').forEach((element) => element.classList.toggle('is-active', element.dataset.view === view));
    queryAll('[data-view-target]').forEach((element) => element.classList.toggle('is-active', element.dataset.viewTarget === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function enterApp(user, demo = false) {
    model.user = user;
    model.demo = demo;
    accessScreen.hidden = true;
    appScreen.hidden = false;
    const displayName = user.displayName || 'Pepperpots member';
    query('[data-member-name]').textContent = displayName;
    query('[data-sign-out]').textContent = initials(displayName);
    query('[data-sync-label]').textContent = demo ? 'Configuration-safe preview · memory only' : 'Realtime cloud sync active';
    query('[data-sync-dot]').classList.toggle('is-demo', demo);
    renderAll();
  }

  function exitApp(message = 'Sign in with an approved Google account.') {
    model.unsubscribeData?.();
    model.unsubscribeData = null;
    model.calendarAccessToken = null;
    model.user = null;
    model.store = null;
    model.demo = false;
    appScreen.hidden = true;
    accessScreen.hidden = false;
    status.textContent = message;
  }

  function renderStats(targetSelector) {
    const stats = [
      ['Vitality', model.personal.stats.vitality],
      ['Endurance', model.personal.stats.endurance],
      ['Focus', model.personal.stats.focus],
      ['Discipline', model.personal.stats.discipline],
    ];
    query(targetSelector).innerHTML = stats.map(([name, value]) => `
      <div class="pp-stat"><span>${name}</span><strong>${String(value).padStart(2, '0')}</strong><div class="pp-stat-bar"><i style="width:${Math.min(100, value * 7)}%"></i></div></div>`).join('');
  }

  function renderToday() {
    model.personal = normalizePersonal(model.personal);
    query('[data-today-label]').textContent = todayLabel();
    query('[data-level]').textContent = String(model.personal.level).padStart(2, '0');
    query('[data-xp-label]').textContent = `${xpWithinLevel(model.personal.xp)} / ${XP_PER_LEVEL} XP`;
    query('[data-streak]').textContent = String(model.personal.streak).padStart(2, '0');
    query('[data-week-dots]').innerHTML = Array.from({ length: 7 }, (_, index) => `<span class="pp-week-dot ${index < Math.min(model.personal.streak, 7) ? 'is-done' : ''}">${index + 1}</span>`).join('');
    query('[data-daily-tasks]').innerHTML = model.personal.dailyQuest.tasks.map((task) => `
      <label class="pp-check"><input type="checkbox" data-daily-task="${task.id}" ${task.checked ? 'checked' : ''} ${model.personal.dailyQuest.completed ? 'disabled' : ''}><span>${escapeHtml(task.label)}</span></label>`).join('');
    const clearButton = query('[data-clear-quest]');
    clearButton.disabled = model.personal.dailyQuest.completed || !model.personal.dailyQuest.tasks.every((task) => task.checked);
    clearButton.innerHTML = model.personal.dailyQuest.completed ? 'Quest cleared · +100 XP' : 'Clear daily quest <span class="pp-button__arrow">→</span>';
    const physicalQuest = PHYSICAL_QUESTS[model.personal.physicalProgression.sessions % PHYSICAL_QUESTS.length];
    query('[data-physical-title]').textContent = physicalQuest.title;
    query('[data-physical-detail]').textContent = physicalQuest.detail;
    query('[data-physical-complete]').dataset.questIndex = String(model.personal.physicalProgression.sessions % PHYSICAL_QUESTS.length);
    const trailComplete = model.personal.weeklyTrailFinder.week === weekKey() && model.personal.weeklyTrailFinder.completed;
    query('[data-trail-finder]').textContent = trailComplete ? 'Trail found this week ✓' : 'Find trails near me →';
    renderStats('[data-stats]');
  }

  function renderSchedule() {
    query('[data-schedule-grid]').innerHTML = HOME_CATEGORIES.map((category) => {
      const items = model.home.schedule[category] ?? [];
      const itemMarkup = items.length ? items.map((item) => `
        <div class="pp-list-item"><div class="pp-list-item__top"><strong>${escapeHtml(item.title)}</strong><button class="pp-item-delete" type="button" data-remove-schedule="${escapeHtml(item.id)}" data-category="${category}">Remove</button></div><small>${escapeHtml(formatShortDate(item.date))}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small></div>`).join('') : '<div class="pp-empty">Nothing scheduled yet.</div>';
      return `<article class="pp-category-card"><div class="pp-category-top"><h3>${category.toUpperCase()}</h3><span>${items.length} ITEM${items.length === 1 ? '' : 'S'}</span></div><div class="pp-item-list">${itemMarkup}</div></article>`;
    }).join('');
  }

  function renderProjects() {
    const target = query('[data-project-list]');
    if (!model.home.projectQueue.length) {
      target.innerHTML = '<div class="pp-empty">The future project queue is clear. Add the next good idea below.</div>';
      return;
    }
    target.innerHTML = model.home.projectQueue.map((project) => `
      <article class="pp-project"><div class="pp-project-meta"><span class="pp-tag pp-tag--pink">${escapeHtml(project.type)}</span>${project.date ? `<span class="pp-tag">${escapeHtml(formatShortDate(project.date))}</span>` : ''}</div><div class="pp-list-item__top"><h4>${escapeHtml(project.title)}</h4><button class="pp-item-delete" type="button" data-remove-project="${escapeHtml(project.id)}">Remove</button></div>${project.target ? `<p><strong>Target:</strong> ${escapeHtml(project.target)}</p>` : ''}${project.note ? `<p>${escapeHtml(project.note)}</p>` : ''}</article>`).join('');
  }

  function renderEvents(selector, events) {
    const target = query(selector);
    if (!events.length) {
      target.innerHTML = '<div class="pp-empty">No events here yet.</div>';
      return;
    }
    target.innerHTML = [...events].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).map((event) => `
      <article class="pp-event"><div class="pp-event-date">${escapeHtml(formatShortDate(event.date))}</div><div><h4>${escapeHtml(event.title)}</h4><p>${escapeHtml(event.category)}${event.startTime ? ` · ${escapeHtml(event.startTime)}` : ''}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</p></div>${event.ownerUid === model.user?.uid || model.demo ? `<button class="pp-item-delete" type="button" data-remove-event="${escapeHtml(event.id)}" data-visibility="${escapeHtml(event.visibility)}">Remove</button>` : ''}</article>`).join('');
  }

  function renderHistory() {
    renderStats('[data-progress-stats]');
    const questHistory = query('[data-quest-history]');
    questHistory.innerHTML = model.personal.questHistory.length
      ? [...model.personal.questHistory].reverse().slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.type)}</strong><br>${escapeHtml(formatShortDate(item.date))} · +${safeNumber(item.xp)} XP</li>`).join('')
      : '<li>No quest clears yet. Today is ready.</li>';
    const recoveryHistory = query('[data-recovery-history]');
    recoveryHistory.innerHTML = model.personal.recoveryHistory.length
      ? [...model.personal.recoveryHistory].reverse().slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.activity)}</strong><br>${escapeHtml(formatShortDate(item.date))}</li>`).join('')
      : '<li>No recovery logged yet.</li>';
    const progression = model.personal.physicalProgression;
    query('[data-physical-progress]').innerHTML = `<li><strong>${progression.sessions}</strong> completed sessions</li><li><strong>${progression.totalMinutes}</strong> active minutes</li><li><strong>${model.personal.questClears}</strong> daily quest clears</li><li><strong>${model.personal.xp}</strong> total XP</li>`;
  }

  function renderAll() {
    renderToday();
    renderSchedule();
    renderProjects();
    renderEvents('[data-private-events]', model.privateEvents);
    renderEvents('[data-shared-events]', model.sharedEvents);
    renderHistory();
  }

  async function savePersonal(next, message) {
    if (containsTrailLocationData(next)) throw new Error('Location data cannot be stored in personal state.');
    model.personal = normalizePersonal(next);
    renderAll();
    try {
      await model.store?.writePersonal(model.personal);
      if (message) showToast(message);
    } catch (error) {
      showToast(error.message || 'Could not sync personal progress.', true);
    }
  }

  async function saveHome(next, message) {
    model.home = normalizeHome(next);
    renderSchedule();
    renderProjects();
    try {
      await model.store?.writeHome(model.home);
      if (message) showToast(message);
    } catch (error) {
      showToast(error.message || 'Could not sync the shared home.', true);
    }
  }

  async function connectGoogleCalendar() {
    if (model.demo || !model.firebase || !model.auth) {
      showToast('Direct Calendar access needs Firebase Google sign-in. The pre-filled Google Calendar fallback is ready.');
      return null;
    }
    try {
      const provider = new model.firebase.auth.GoogleAuthProvider();
      provider.addScope(CALENDAR_SCOPE);
      provider.setCustomParameters({ prompt: 'consent' });
      const result = await model.firebase.auth.reauthenticateWithPopup(model.auth.currentUser, provider);
      const credential = model.firebase.auth.GoogleAuthProvider.credentialFromResult(result);
      model.calendarAccessToken = credential?.accessToken || null;
      if (!model.calendarAccessToken) throw new Error('Calendar authorization did not return an event token.');
      query('[data-calendar-status]').textContent = 'Connected for this session · token held in memory only';
      showToast('Google Calendar connected for this session.');
      return model.calendarAccessToken;
    } catch {
      model.calendarAccessToken = null;
      query('[data-calendar-status]').textContent = 'Not connected · safe fallback available';
      showToast('Calendar connection was unavailable. The pre-filled fallback remains ready.', true);
      return null;
    }
  }

  async function sendToGoogleCalendar(event) {
    const token = model.calendarAccessToken || await connectGoogleCalendar();
    if (!token) {
      window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer');
      return 'fallback';
    }
    try {
      const response = await fetch(PEPPERPOTS_CONFIG.googleCalendar.insertEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(toGoogleCalendarResource(event)),
      });
      if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
      showToast('Saved to Pepperpots and Google Calendar.');
      return 'direct';
    } catch {
      model.calendarAccessToken = null;
      query('[data-calendar-status]').textContent = 'Connection expired · safe fallback opened';
      window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer');
      showToast('Pepperpots saved the event. Google Calendar opened with the event pre-filled.');
      return 'fallback';
    }
  }

  queryAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget), { signal }));
  query('[data-view-link]').addEventListener('click', (event) => { event.preventDefault(); showView('today'); }, { signal });

  root.addEventListener('change', async (event) => {
    const task = event.target.closest?.('[data-daily-task]');
    if (task) await savePersonal(toggleDailyTask(model.personal, task.dataset.dailyTask, task.checked));
  }, { signal });

  query('[data-clear-quest]').addEventListener('click', async () => savePersonal(completeDailyQuest(model.personal), 'Daily Quest cleared · +100 XP'), { signal });
  query('[data-physical-complete]').addEventListener('click', async (event) => {
    const quest = PHYSICAL_QUESTS[Number(event.currentTarget.dataset.questIndex) || 0];
    await savePersonal(completePhysicalQuest(model.personal, quest), `${quest.title} cleared · +75 XP`);
  }, { signal });
  queryAll('[data-recovery]').forEach((button) => button.addEventListener('click', async () => savePersonal(recordRecovery(model.personal, button.dataset.recovery), `${button.dataset.recovery} added to private recovery history.`), { signal }));
  query('[data-trail-finder]').addEventListener('click', async () => {
    await savePersonal(markTrailFinderComplete(model.personal));
    const openGenericTrailSearch = () => window.open('https://www.google.com/maps/search/hiking+trails+near+me/', '_blank', 'noopener,noreferrer');
    const requested = requestTrailLocation({ geolocation: navigator.geolocation, onResolved: openGenericTrailSearch, onDenied: openGenericTrailSearch });
    if (!requested) openGenericTrailSearch();
    showToast('Trail Finder opened. No coordinates or routes were stored.');
  }, { signal });

  query('[data-schedule-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (!HOME_CATEGORIES.includes(values.category)) return;
    const item = { id: makeId('schedule'), title: String(values.title).trim().slice(0, 160), date: values.date, note: String(values.note).trim().slice(0, 500) };
    const next = normalizeHome(model.home);
    next.schedule[values.category] = [...next.schedule[values.category], item];
    await saveHome(next, `${values.category} schedule updated for both members.`);
    form.reset();
    form.elements.date.value = dateKey();
  }, { signal });

  query('[data-project-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (!PROJECT_TYPES.includes(values.type)) return;
    const project = { id: makeId('project'), title: String(values.title).trim().slice(0, 160), type: values.type, target: String(values.target).trim().slice(0, 160), date: values.date, note: String(values.note).trim().slice(0, 1000) };
    const next = normalizeHome(model.home);
    next.projectQueue = [...next.projectQueue, project];
    await saveHome(next, 'Future Project Queue updated for both members.');
    form.reset();
  }, { signal });

  root.addEventListener('click', async (event) => {
    const scheduleButton = event.target.closest?.('[data-remove-schedule]');
    if (scheduleButton) {
      const next = normalizeHome(model.home);
      next.schedule[scheduleButton.dataset.category] = next.schedule[scheduleButton.dataset.category].filter((item) => item.id !== scheduleButton.dataset.removeSchedule);
      await saveHome(next, 'Schedule item removed.');
    }
    const projectButton = event.target.closest?.('[data-remove-project]');
    if (projectButton) {
      const next = normalizeHome(model.home);
      next.projectQueue = next.projectQueue.filter((item) => item.id !== projectButton.dataset.removeProject);
      await saveHome(next, 'Project removed from the queue.');
    }
    const eventButton = event.target.closest?.('[data-remove-event]');
    if (eventButton) {
      try {
        await model.store?.deleteEvent(eventButton.dataset.removeEvent, eventButton.dataset.visibility);
        if (model.demo) {
          const key = eventButton.dataset.visibility === 'PRIVATE' ? 'privateEvents' : 'sharedEvents';
          model[key] = model[key].filter((item) => item.id !== eventButton.dataset.removeEvent);
          renderEvents(key === 'privateEvents' ? '[data-private-events]' : '[data-shared-events]', model[key]);
        }
        showToast('Event removed from Pepperpots.');
      } catch (error) { showToast(error.message || 'Could not remove event.', true); }
    }
  }, { signal });

  const eventForm = query('[data-event-form]');
  const categorySelect = query('#event-category');
  const visibilitySelect = query('#event-visibility');
  categorySelect.addEventListener('change', () => {
    const doctor = categorySelect.value === 'Doctor';
    if (doctor) visibilitySelect.value = 'PRIVATE';
    query('[data-doctor-tip]').hidden = !doctor;
  }, { signal });

  eventForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitMode = event.submitter?.value || 'pepperpots';
    let calendarEvent;
    try {
      calendarEvent = sanitizeEvent(Object.fromEntries(new FormData(form)), model.user.uid);
      if (model.demo) {
        const stored = { ...calendarEvent, id: makeId('event') };
        const key = stored.visibility === 'PRIVATE' ? 'privateEvents' : 'sharedEvents';
        model[key] = [...model[key], stored];
        renderEvents(key === 'privateEvents' ? '[data-private-events]' : '[data-shared-events]', model[key]);
      } else {
        await model.store.addEvent(calendarEvent);
      }
      showToast('Event saved to Pepperpots.');
      if (submitMode === 'google') await sendToGoogleCalendar(calendarEvent);
      form.reset();
      form.elements.date.value = dateKey();
      visibilitySelect.value = 'PRIVATE';
      query('[data-doctor-tip]').hidden = true;
    } catch (error) { showToast(error.message || 'Could not save the event.', true); }
  }, { signal });

  query('[data-connect-calendar]').addEventListener('click', connectGoogleCalendar, { signal });
  query('[data-demo]').addEventListener('click', () => {
    model.store = createMemoryStore(model);
    enterApp({ uid: 'preview-member', displayName: 'Pepperpots Preview' }, true);
  }, { signal });

  query('[data-sign-out]').addEventListener('click', async () => {
    if (model.demo) return exitApp('Configuration-safe preview closed. No data was stored.');
    await model.firebase?.auth.signOut(model.auth);
  }, { signal });

  query('[data-sign-in]').addEventListener('click', async () => {
    if (!model.auth || !model.firebase) {
      showToast('Firebase Web configuration is not connected yet.', true);
      return;
    }
    const provider = new model.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await model.firebase.auth.signInWithPopup(model.auth, provider);
    } catch (error) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error.code)) {
        await model.firebase.auth.signInWithRedirect(model.auth, provider);
      } else if (error.code !== 'auth/popup-closed-by-user') {
        showToast('Google sign-in could not be completed.', true);
      }
    }
  }, { signal });

  query('#schedule-date').value = dateKey();
  query('#event-date').value = dateKey();

  async function initialize() {
    if (!isFirebaseConfigured()) {
      status.textContent = 'The application is complete, but this copy is not connected to a Firebase Web app yet. Preview mode never stores data.';
      query('[data-sign-in]').disabled = true;
      query('[data-demo]').hidden = false;
      return;
    }
    try {
      status.textContent = 'Secure sign-in ready. Only active member UIDs can continue.';
      model.firebase = await loadFirebaseModules();
      const app = model.firebase.app.initializeApp(PEPPERPOTS_CONFIG.firebase);
      model.auth = model.firebase.auth.getAuth(app);
      const database = model.firebase.firestore.getFirestore(app);
      await model.firebase.auth.getRedirectResult(model.auth).catch(() => null);
      model.unsubscribeAuth = model.firebase.auth.onAuthStateChanged(model.auth, async (user) => {
        if (!user) return exitApp('Sign in with an approved Google account.');
        status.textContent = 'Checking Pepperpots membership…';
        const memberRef = model.firebase.firestore.doc(database, 'members', user.uid);
        const member = await model.firebase.firestore.getDoc(memberRef);
        if (!member.exists() || member.data().active !== true) {
          await model.firebase.auth.signOut(model.auth);
          return exitApp('Access not approved. This Google account is not an active Pepperpots member.');
        }
        model.store = await createFirebaseStore(model.firebase.firestore, database, user.uid);
        model.unsubscribeData = model.store.subscribe({
          onPersonal: (value) => { model.personal = normalizePersonal(value); renderToday(); renderHistory(); },
          onHome: (value) => { model.home = normalizeHome(value); renderSchedule(); renderProjects(); },
          onPrivateEvents: (events) => { model.privateEvents = events; renderEvents('[data-private-events]', events); },
          onSharedEvents: (events) => { model.sharedEvents = events; renderEvents('[data-shared-events]', events); },
          onError: () => showToast('A realtime sync listener needs attention.', true),
        });
        enterApp({ uid: user.uid, displayName: member.data().displayName || user.displayName || 'Pepperpots member' });
      });
    } catch (error) {
      status.textContent = 'Secure cloud setup could not start. No data was exposed.';
      query('[data-demo]').hidden = false;
      showToast(error.message || 'Firebase initialization failed.', true);
    }
  }

  initialize();
  const cleanup = () => {
    controller.abort();
    model.unsubscribeData?.();
    model.unsubscribeAuth?.();
    window.clearTimeout(showToast.timeout);
    mountedRoots.delete(root);
  };
  mountedRoots.set(root, cleanup);
  return cleanup;
}

function createMemoryStore() {
  return {
    writePersonal: async () => {},
    writeHome: async () => {},
    addEvent: async () => {},
    deleteEvent: async () => {},
  };
}

async function loadFirebaseModules() {
  const version = PEPPERPOTS_CONFIG.firebaseSdkVersion;
  const base = `https://www.gstatic.com/firebasejs/${version}`;
  const [app, auth, firestore] = await Promise.all([
    import(/* @vite-ignore */ `${base}/firebase-app.js`),
    import(/* @vite-ignore */ `${base}/firebase-auth.js`),
    import(/* @vite-ignore */ `${base}/firebase-firestore.js`),
  ]);
  return { app, auth, firestore };
}

async function createFirebaseStore(api, database, uid) {
  const personalRef = api.doc(database, ...personalStatePath(uid).split('/'));
  const homeRef = api.doc(database, ...sharedHomePath(PEPPERPOTS_CONFIG.householdId).split('/'));
  const privateCollection = api.collection(database, ...eventCollectionPath(uid, 'PRIVATE').split('/'));
  const sharedCollection = api.collection(database, ...eventCollectionPath(uid, 'SHARED', PEPPERPOTS_CONFIG.householdId).split('/'));

  await api.runTransaction(database, async (transaction) => {
    const personal = await transaction.get(personalRef);
    if (!personal.exists()) transaction.set(personalRef, { ...createDefaultPersonal(), updatedAt: api.serverTimestamp() });
  });
  await api.runTransaction(database, async (transaction) => {
    const home = await transaction.get(homeRef);
    if (!home.exists()) transaction.set(homeRef, { ...createDefaultHome(), updatedAt: api.serverTimestamp() });
  });

  return {
    subscribe({ onPersonal, onHome, onPrivateEvents, onSharedEvents, onError }) {
      const unsubscribers = [
        api.onSnapshot(personalRef, (snapshot) => snapshot.exists() && onPersonal(snapshot.data()), onError),
        api.onSnapshot(homeRef, (snapshot) => snapshot.exists() && onHome(snapshot.data()), onError),
        api.onSnapshot(api.query(privateCollection, api.orderBy('date', 'asc')), (snapshot) => onPrivateEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError),
        api.onSnapshot(api.query(sharedCollection, api.orderBy('date', 'asc')), (snapshot) => onSharedEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError),
      ];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
    async writePersonal(value) {
      if (containsTrailLocationData(value)) throw new Error('Trail location data is never persisted.');
      await api.setDoc(personalRef, { ...value, updatedAt: api.serverTimestamp() });
    },
    async writeHome(value) {
      await api.runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(homeRef);
        const current = snapshot.exists() ? normalizeHome(snapshot.data()) : createDefaultHome();
        const next = normalizeHome(value);
        transaction.set(homeRef, { ...current, ...next, updatedAt: api.serverTimestamp() });
      });
    },
    async addEvent(event) {
      const collectionRef = event.visibility === 'PRIVATE' ? privateCollection : sharedCollection;
      await api.addDoc(collectionRef, { ...event, createdAt: api.serverTimestamp(), updatedAt: api.serverTimestamp() });
    },
    async deleteEvent(id, visibility) {
      const collectionRef = visibility === 'PRIVATE' ? privateCollection : sharedCollection;
      await api.deleteDoc(api.doc(collectionRef, id));
    },
  };
}

if (typeof document !== 'undefined') {
  const staticRoot = document.getElementById('pepperpots-root');
  if (staticRoot) mountPepperpots(staticRoot);
}

/**
 * Public Firebase Web configuration only.
 *
 * Firebase Web API keys identify a project; they are not server credentials.
 * Never add OAuth client secrets, service-account keys, access tokens, refresh
 * tokens, passwords, or private keys to this file.
 */
export const PEPPERPOTS_CONFIG = Object.freeze({
  householdId: 'pepperpots',
  firebaseSdkVersion: '12.17.1',
  firebase: Object.freeze({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  }),
  googleCalendar: Object.freeze({
    scope: 'https://www.googleapis.com/auth/calendar.events.owned',
    insertEndpoint: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    fallbackEndpoint: 'https://calendar.google.com/calendar/render',
  }),
});

export function isFirebaseConfigured(config = PEPPERPOTS_CONFIG) {
  const firebase = config?.firebase ?? {};
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every(
    (key) => typeof firebase[key] === 'string' && firebase[key].trim().length > 0,
  );
}

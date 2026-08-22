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
    apiKey: 'AIzaSyBEZgG_VZ5fZSIjv4cnmuithG4z7H8MLwQ',
    authDomain: 'pepperpots-27a39.firebaseapp.com',
    projectId: 'pepperpots-27a39',
    storageBucket: 'pepperpots-27a39.firebasestorage.app',
    messagingSenderId: '718458740013',
    appId: '1:718458740013:web:4299f6e10c40f3bb7f87a4',
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

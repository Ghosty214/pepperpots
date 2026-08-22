# PEPPERPOTS v1.0

PEPPERPOTS is a private, responsive two-person home system. Each approved member gets isolated progression data while both members share the home schedule, Future Project Queue, and shared Calendar events.

## What is included

- Daily Quest, XP, levels, streaks, quest clears, and a 7-day reward
- Vitality, Endurance, Focus, and Discipline stats
- Physical Quest, Weekly Trail Finder, and private Recovery history
- Shared EDIT, COOK, DECORATE, and CLEAN schedule
- Shared Future Project Queue with title, type, target, date, and note
- Private and shared Calendar events with category, times, location, notes, reminder, and repeat
- Incremental Google Calendar authorization using the event-only scope
- Pre-filled Google Calendar fallback when a direct Calendar token is unavailable
- Firebase Google Authentication, UID approval, Cloud Firestore realtime listeners, and deny-by-default rules
- iPhone, Android, tablet, and desktop layouts

## Security model

Authentication identifies a Google user. Firestore rules perform authorization.

Exactly two member documents must be provisioned out-of-band:

```text
members/<uid>
  active: true
  displayName: optional
```

The browser app can read only the signed-in user's own member document. It cannot create, edit, list, or delete membership documents, so an unapproved user cannot approve themselves. To revoke a member, set `active` to `false` from the Firebase Console or trusted admin tooling.

Personal data is isolated by UID:

```text
users/<uid>/state/main
users/<uid>/events/<eventId>
```

Shared data is stored only in the Pepperpots household:

```text
households/pepperpots/state/home
households/pepperpots/events/<eventId>
```

Private Calendar events are stored beneath the owner UID. Shared events are stored beneath the household. Realtime `onSnapshot` listeners are attached only after the signed-in UID has an active member record.

## Firebase setup

The dedicated Firebase project is `pepperpots-27a39`, and the registered Web app's public configuration is checked into `config.js`. The default Firestore database uses the `nam5` United States multi-region in production mode.

1. In **Authentication → Sign-in method**, enable Google.
2. In **Authentication → Settings → Authorized domains**, add the final Pages hostname and keep localhost for development.
3. Deploy the checked-in rules after authenticating remotely:

   ```bash
   npx --yes firebase-tools@15.28.1 login --no-localhost
   npx --yes firebase-tools@15.28.1 deploy --only firestore:rules --project pepperpots-27a39 --non-interactive
   ```

4. Have each intended member attempt Google sign-in once. In **Authentication → Users**, copy the two UIDs.
5. In Firestore, create exactly those two `members/<uid>` documents with `active: true`. Optional `displayName` is safe; private email addresses are not needed in the frontend.

The Firebase Web configuration is a public project identifier. Authorization depends on Authentication plus `firestore.rules`, never on hiding the Web API key.

## Google Calendar setup

1. In the Google Cloud project linked to Firebase, enable the Google Calendar API.
2. Configure the OAuth consent screen for the two intended users.
3. Add the Calendar Events scope:

   ```text
   https://www.googleapis.com/auth/calendar.events.owned
   ```

4. Keep the app's Firebase/GitHub Pages origins on the OAuth client's authorized origin list.

Calendar permission is requested only when **Connect Google Calendar** or **SAVE + GOOGLE CALENDAR** is used. The access token exists only in page memory and is cleared on sign-out or failure. It is never written to Firestore, browser storage, logs, Git, or a URL. No refresh token or OAuth secret belongs in this static application.

If direct authorization is unavailable, PEPPERPOTS opens a Google Calendar template with the event pre-filled. The Pepperpots event is still saved first.

## Trail Finder privacy

Geolocation is called only inside the explicit Trail Finder tap handler. The callback discards the position and opens a generic nearby-trails search. Coordinates, routes, and location history are never included in personal state, household state, browser storage, application logs, or repository files. Only the current week's completion marker is saved to the signed-in member's private state.

## Local development and validation

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm run check
```

`npm run check` runs lint, the Node test suite, and the production build. Tests cover quest and leveling logic, streaks, stats, recovery, all home categories, project types, UID/path isolation, event privacy defaults, shared paths, Calendar fallback, Trail Finder privacy, responsive source rules, ignored secret files, and security-rule invariants.

The Firestore rules are also structured for Firebase Emulator Suite tests. Running the Firestore emulator additionally requires a Java runtime; production deployment does not.

## GitHub Pages

The root `index.html`, `styles.css`, `app.js`, and `config.js` are directly publishable without a server build.

1. Push the `main` branch to a repository named `pepperpots`.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**.
4. Choose `main` and `/(root)`.

The expected URL format is:

```text
https://<github-user>.github.io/pepperpots/
```

## Repository safety

The repository intentionally ignores `.env`, `.env.local`, Firebase local state, service-account-shaped files, private key formats, credential files, and token files. Before each push, inspect the staged files and run:

```bash
git check-ignore .env .env.local
npm test
npm run build
```

Never commit passwords, OAuth secrets, access or refresh tokens, service accounts, private keys, personal location data, or private health details.

## Key files

- `index.html` — GitHub Pages entry
- `styles.css` — responsive black, white, and pink interface
- `app.js` — application logic, Firebase realtime sync, and Calendar integration
- `config.js` — public Firebase Web configuration only
- `firestore.rules` — member allowlist and data-isolation rules
- `firebase.json` — Firestore rules deployment target
- `tests/` — automated functional, privacy, repository, and security checks
- `.openai/hosting.json` plus `app/` — validated Sites-compatible build surface

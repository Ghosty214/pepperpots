import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');

function sourceFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', 'dist', '.next', '.vinext', '.wrangler', 'coverage'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:html|css|js|json|md|rules|tsx|ts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test('all required production files exist', () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'config.js', 'firestore.rules', 'README.md', '.nojekyll', '.gitignore']) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
  assert.equal(statSync(join(root, '.nojekyll')).isFile(), true);
});

test('HTML loads the responsive Pepperpots application', () => {
  const html = read('index.html');
  assert.match(html, /name="viewport"/);
  assert.match(html, /styles\.css/);
  assert.match(html, /app\.js/);
  assert.match(html, /PEPPERPOTS/);
});

test('mobile and desktop responsive rules are present', () => {
  const css = read('styles.css');
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 1020px\)/);
  assert.match(css, /grid-template-columns: repeat\(4/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('realtime Firebase listeners and membership gate are wired', () => {
  const app = read('app.js');
  assert.ok((app.match(/onSnapshot/g) || []).length >= 4);
  assert.match(app, /doc\(database, 'members', user\.uid\)/);
  assert.match(app, /member\.data\(\)\.active !== true/);
  assert.match(app, /signInWithPopup/);
});

test('Firestore rules deny self-approval, isolate UIDs, and default deny', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/members\/\{uid\}/);
  assert.match(rules, /allow list, create, update, delete: if false/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /match \/households\/pepperpots\/state\/home/);
  assert.match(rules, /validEvent\(request\.resource\.data, 'PRIVATE', uid\)/);
  assert.match(rules, /validEvent\(request\.resource\.data, 'SHARED', request\.auth\.uid\)/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});

test('Trail Finder uses no background watch or browser storage', () => {
  const app = read('app.js');
  assert.doesNotMatch(app, /watchPosition/);
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
  assert.match(app, /data-trail-finder/);
  assert.match(app, /requestTrailLocation/);
});

test('7-Day Reward contains exactly the allowed reward copy and no prohibited copy', () => {
  const app = read('app.js');
  assert.match(app, /7-DAY REWARD<br>Smoke<br>Ghost<br>game time/);
  const prohibitedRewardTerm = new RegExp(['inti', 'macy'].join(''), 'i');
  assert.doesNotMatch(sourceFiles().map((file) => readFileSync(file, 'utf8')).join('\n'), prohibitedRewardTerm);
});

test('environment files and credential-shaped files are ignored', () => {
  const ignored = execFileSync('git', ['check-ignore', '.env', '.env.local', 'credentials.json', 'token.json'], { cwd: root, encoding: 'utf8' });
  assert.match(ignored, /^\.env$/m);
  assert.match(ignored, /^\.env\.local$/m);
  assert.match(ignored, /^credentials\.json$/m);
  assert.match(ignored, /^token\.json$/m);
});

test('tracked source contains no embedded secret material or real coordinate pairs', () => {
  const files = sourceFiles();
  const firebaseConfigPath = join(root, 'config.js');
  const firebaseApiKeyPattern = /apiKey:\s*'AIza[0-9A-Za-z_-]{30,}'/g;
  const firebaseConfig = readFileSync(firebaseConfigPath, 'utf8');
  assert.equal(
    firebaseConfig.match(firebaseApiKeyPattern)?.length,
    1,
    'config.js may contain exactly one public Firebase Web API key',
  );

  const source = files.map((file) => {
    const contents = readFileSync(file, 'utf8');
    return file === firebaseConfigPath
      ? contents.replace(firebaseApiKeyPattern, "apiKey: 'PUBLIC_FIREBASE_WEB_API_KEY'")
      : contents;
  }).join('\n');
  const forbidden = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /client_secret\s*[=:]\s*["'][^"']{8,}/i,
    /refresh_token\s*[=:]\s*["'][^"']{8,}/i,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /AIza[0-9A-Za-z_-]{30,}/,
    /"type"\s*:\s*"service_account"/,
    /-?\d{1,2}\.\d{5,}\s*,\s*-?\d{1,3}\.\d{5,}/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern);
});

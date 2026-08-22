import test from 'node:test';
import assert from 'node:assert/strict';
import { containsTrailLocationData, createDefaultPersonal, requestTrailLocation } from '../app.js';

test('Trail Finder does not request location until the tap handler calls it', () => {
  let requests = 0;
  const geolocation = { getCurrentPosition(success) { requests += 1; success({ coords: { latitude: 0, longitude: 0 } }); } };
  assert.equal(requests, 0);
  let resolved = 0;
  assert.equal(requestTrailLocation({ geolocation, onResolved: () => { resolved += 1; } }), true);
  assert.equal(requests, 1);
  assert.equal(resolved, 1);
});

test('personal state contains no Trail Finder coordinates, routes, or location history', () => {
  const personal = createDefaultPersonal('2026-08-22');
  assert.equal(containsTrailLocationData(personal), false);
  assert.equal(containsTrailLocationData({ weeklyTrailFinder: { latitude: 1 } }), true);
  assert.equal(containsTrailLocationData({ routeHistory: [] }), true);
});

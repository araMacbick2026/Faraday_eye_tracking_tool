import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAppServer } from './server.mjs';

const codes = { coach: 'coach-test-code-01', athlete: 'athlete-test-code-02', parent: 'parent-test-code-03' };

async function start(env, options) {
  const server = createAppServer(env, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    request: (path, options) => fetch('http://127.0.0.1:' + server.address().port + path, options),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

const post = (body, cookie) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body)
});

test('pilot is closed until distinct role codes are configured', async () => {
  const app = await start({});
  try {
    assert.match(await (await app.request('/pilot/')).text(), /Fictional hockey roster/i);
    assert.equal((await app.request('/pilot/api/progress')).status, 503);
  } finally { await app.close(); }
});

test('role boundaries, independent weekly inputs, and persistent updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'faraday-pilot-'));
  const env = {
    PILOT_COACH_CODE: codes.coach, PILOT_ATHLETE_CODE: codes.athlete, PILOT_PARENT_CODE: codes.parent,
    PILOT_DATA_FILE: join(dir, 'records.json')
  };
  let app = await start(env);
  const signIn = async role => {
    const res = await app.request('/pilot/api/login', post({ role, code: codes[role] }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return res.headers.get('set-cookie').split(';')[0];
  };
  const progress = async (cookie, date = '2026-11-09') => {
    const res = await app.request('/pilot/api/progress?date=' + date, { headers: { cookie } });
    assert.equal(res.status, 200);
    return res.json();
  };
  const add = (cookie, entry) => app.request('/pilot/api/entries', post({ date: '2026-11-10', ...entry }, cookie));
  try {
    assert.equal((await app.request('/pilot/api/progress')).status, 401);
    assert.equal((await app.request('/pilot/api/login', post({ role: 'coach', code: codes.parent }))).status, 401);
    const coach = await signIn('coach');
    const athlete = await signIn('athlete');
    const parent = await signIn('parent');
    assert.equal((await add(parent, { type: 'skill', attempts: 10, successful: 8 })).status, 403);
    assert.equal((await add(athlete, { type: 'school', note: 'Attempt' })).status, 403);
    assert.equal((await add(parent, { type: 'measurement', metricId: 'sprint-ice', value: 6.18 })).status, 403);
    assert.equal((await add(coach, { type: 'measurement', metricId: 'sprint-ice', value: 0 })).status, 400);
    assert.equal((await add(coach, { type: 'measurement', metricId: 'unknown', value: 4 })).status, 400);
    assert.equal((await add(coach, { type: 'measurement', metricId: 'pull-ups', value: 2.5 })).status, 400);
    assert.equal((await add(coach, { type: 'measurement', metricId: 'sprint-ice', value: 6.18 })).status, 201);
    assert.equal((await add(coach, { type: 'skill', attempts: 10, successful: 11 })).status, 400);
    assert.equal((await add(coach, { type: 'skill', attempts: 10, successful: 8 })).status, 201);
    assert.equal((await add(coach, { type: 'followup', outcome: 'independent' })).status, 201);
    assert.equal((await add(athlete, { type: 'reflection', note: 'Private reflection' })).status, 201);
    assert.equal((await add(athlete, { type: 'nutrition', outcome: 'no' })).status, 201);
    assert.equal((await add(athlete, { type: 'nutrition', outcome: 'yes' })).status, 201);
    const report = await progress(parent);
    assert.deepEqual(report.history.map(item => item.successful), [5, 7, 8]);
    assert.deepEqual(new Set(report.weekly.map(item => item.type)), new Set(['skill', 'school', 'followup', 'measurement']));
    assert.equal(report.measurements[0].value, 6.18);
    assert.equal(report.measurements[0].athleteId, report.athlete.id);
    assert.equal(report.reference, null);
    assert.equal((await progress(parent, '2026-11-02')).measurements.length, 0);
    const athleteReport = await progress(athlete);
    assert.equal(athleteReport.weekly.filter(item => item.type === 'nutrition' && item.date === '2026-11-10').length, 1);
    assert.equal((await progress(parent, '2026-11-16')).weekly.length, 0);
    assert.equal((await app.request('/pilot/api/logout', post({}, parent))).status, 200);
    assert.equal((await app.request('/pilot/api/progress', { headers: { cookie: parent } })).status, 401);
    await app.close();
    app = await start({ ...env, PILOT_SHARE_NUTRITION: 'true' });
    const reopened = await progress(await signIn('parent'));
    assert.equal(reopened.history.at(-1).successful, 8);
    assert.equal(reopened.measurements[0].value, 6.18);
    assert.equal(reopened.weekly.filter(item => item.type === 'nutrition').length, 2);
  } finally {
    await app.close();
    await rm(env.PILOT_DATA_FILE, { force: true });
    await rmdir(dir);
  }
});

test('local preview starts at sign-in and accepts distinct four-digit PINs', async () => {
  const app = await start({ PILOT_SHARE_NUTRITION: 'true' }, { localPreview: true });
  try {
    assert.match(await (await app.request('/')).text(), /Your role/);
    for (const route of ['/studio', '/index.html', '/INDEX.HTML', '/pilot/studio', '/pilot/%73tudio']) {
      const response = await app.request(route);
      assert.match(await response.text(), /Your role/);
    }
    const config = await (await app.request('/pilot/api/setup')).json();
    assert.equal(config.enabled, true);
    assert.equal(new Set(Object.values(config.demoPins)).size, 3);
    for (const [role, code] of Object.entries(config.demoPins)) {
      assert.match(code, /^\d{4}$/);
      const response = await app.request('/pilot/api/login', post({ role, code }));
      assert.equal(response.status, 200);
      const cookie = response.headers.get('set-cookie').split(';')[0];
      const studio = await app.request('/pilot/studio', { headers: { cookie } });
      assert.equal(studio.status, role === 'parent' ? 403 : 200);
      assert.equal(studio.headers.get('cache-control'), 'no-store');
      const data = await (await app.request('/pilot/api/progress', { headers: { cookie } })).json();
      assert.equal(new Set(data.measurements.map(item => item.metricId)).size, 14);
      assert.ok(data.reference['sprint-ice'] > 0);
      assert.equal(data.athlete.name, 'Alex Morgan');
      assert.equal(data.weekly.find(item => item.type === 'followup').outcome, 'independent');
      assert.equal(data.weekly.filter(item => item.type === 'nutrition').length, role === 'coach' ? 0 : 2);
      assert.equal(data.weekly.some(item => item.type === 'reflection'), role !== 'parent');
      if (role !== 'parent') assert.match(await studio.text(), /Observation studio/);
      await app.request('/pilot/api/logout', post({}, cookie));
      assert.equal((await app.request('/pilot/studio', { headers: { cookie }, redirect: 'manual' })).status, 302);
    }
    assert.equal((await app.request('/pilot/api/login', post({ role: 'coach', code: config.demoPins.parent }))).status, 401);
  } finally { await app.close(); }
});

test('four-digit codes are restricted to an in-memory hosted demo with distinct codes', async () => {
  for (const extra of [{}, { PILOT_DEMO: 'true', PILOT_DATA_FILE: 'records.json' },
    { PILOT_DEMO: 'true', PILOT_PARENT_CODE: '2468' }]) {
    const app = await start({ PILOT_COACH_CODE: '2468', PILOT_ATHLETE_CODE: '3579', PILOT_PARENT_CODE: '4680', ...extra });
    try {
      const config = await (await app.request('/pilot/api/setup')).json();
      assert.deepEqual(config, { enabled: false, demoPins: null });
      assert.equal((await app.request('/pilot/api/login', post({ role: 'coach', code: '2468' }))).status, 503);
    } finally { await app.close(); }
  }
});

test('hosted demo starts at sign-in and loads sample data without exposing PINs', async () => {
  const demoCodes = { coach: '0381', athlete: '9145', parent: '5120' };
  const app = await start({
    NODE_ENV: 'production', PILOT_DEMO: 'true', PILOT_SHARE_NUTRITION: 'true',
    PILOT_COACH_CODE: demoCodes.coach, PILOT_ATHLETE_CODE: demoCodes.athlete, PILOT_PARENT_CODE: demoCodes.parent
  });
  try {
    assert.match(await (await app.request('/')).text(), /Your role/);
    assert.deepEqual(await (await app.request('/pilot/api/setup')).json(), { enabled: true, demoPins: null, demo: true, fourDigitCodes: true });
    assert.equal((await app.request('/pilot/api/login', post({ role: 'coach', code: demoCodes.parent }))).status, 401);
    assert.equal((await app.request('/pilot/api/login', post({ role: 'coach', code: '381' }))).status, 401);
    assert.equal((await app.request('/studio', { redirect: 'manual' })).headers.get('location'), '/pilot/studio');
    const summary = { story: 'A sample story', mode: 'pointer', quality: 'rehearsal-not-gaze',
      durationMs: 12000, coverage: 95, predictions: 215, beforePx: 12, afterPx: null, pauses: 0 };
    assert.equal((await app.request('/pilot/api/observations', post(summary))).status, 401);
    for (const [role, code] of Object.entries(demoCodes)) {
      const response = await app.request('/pilot/api/login', post({ role, code }));
      assert.equal(response.status, 200);
      const session = response.headers.get('set-cookie');
      assert.match(session, /; Secure/);
      const cookie = session.split(';')[0];
      const data = await (await app.request('/pilot/api/progress', { headers: { cookie } })).json();
      assert.equal(new Set(data.measurements.map(item => item.metricId)).size, 14);
      assert.ok(data.weekly.some(item => item.type === 'followup'));
      assert.equal(data.weekly.filter(item => item.type === 'nutrition').length, role === 'coach' ? 0 : 2);
      if (role === 'coach') {
        assert.equal(data.observation, null);
        assert.equal((await app.request('/pilot/api/observations', post({ ...summary, coverage: 101 }, cookie))).status, 400);
        const saved = await app.request('/pilot/api/observations', post({ ...summary, samples: [{ x: 123, y: 321 }] }, cookie));
        assert.equal(saved.status, 201);
        const { savedAt, ...observation } = (await saved.json()).observation;
        assert.ok(Date.parse(savedAt));
        assert.deepEqual(observation, { ...summary, savedBy: 'coach' });
      } else if (role === 'athlete') {
        const { savedAt, ...observation } = data.observation;
        assert.ok(Date.parse(savedAt));
        assert.deepEqual(observation, { ...summary, savedBy: 'coach' });
      } else {
        assert.equal('observation' in data, false);
        assert.equal((await app.request('/pilot/api/observations', post(summary, cookie))).status, 403);
      }
    }
  } finally { await app.close(); }
});

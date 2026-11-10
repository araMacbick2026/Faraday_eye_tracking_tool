import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { metrics } from './dist/pilot-metrics.js';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const athlete = { id: 'pilot-athlete', name: 'Alex Morgan', team: 'Faraday Hockey Pilot', position: 'Forward', season: '2026–27' };
const roles = ['coach', 'athlete', 'parent'];
const dayMs = 86400000;
const weekMs = 7 * dayMs;
const sample = [
  { type: 'skill', date: '2026-11-02', attempts: 10, successful: 5, note: 'Baseline for the same passing drill.' },
  { type: 'skill', date: '2026-11-09', attempts: 10, successful: 7, note: 'Look up before passing.' },
  { type: 'reflection', date: '2026-11-09', note: 'Looking up helped me see the target earlier.' },
  { type: 'school', date: '2026-11-09', source: 'Teacher sample', note: 'Three of four assignments completed.' },
  { type: 'nutrition', date: '2026-11-09', outcome: 'yes' }
];
// Fictional testing sessions and reference values for the local preview.
const demoWeeklyUpdates = [
  { type: 'followup', date: '2026-11-03', outcome: 'prompted', note: 'Looked up before passing after a reminder.' },
  { type: 'school', date: '2026-11-02', source: 'Sample teacher update', note: 'Completed two of four assignments.' },
  { type: 'reflection', date: '2026-11-02', note: 'I watched the puck and missed the open teammate.' },
  { type: 'nutrition', date: '2026-11-02', outcome: 'no' },
  { type: 'nutrition', date: '2026-11-03', outcome: 'yes' },
  { type: 'followup', date: '2026-11-10', outcome: 'independent', note: 'Found an open teammate in a new drill without a reminder.' },
  { type: 'nutrition', date: '2026-11-10', outcome: 'yes', meals: 'regular' },
  { type: 'nutrition', date: '2026-11-11', outcome: 'yes', meals: 'regular' },
  { type: 'nutrition', date: '2026-11-12', outcome: 'no', meals: 'missed' },
  { type: 'nutrition', date: '2026-11-13', outcome: 'yes', meals: 'regular' },
  { type: 'goal', date: '2026-11-09', note: 'Look up before passing in the next two practices.', status: 'working' },
  ...[
    ['2026-10-19', '2026-10-22', 79, 29, 4],
    ['2026-10-26', '2026-10-29', 82, 34, 5],
    ['2026-11-02', '2026-11-05', 85, 38, 5],
    ['2026-11-09', '2026-11-12', 88, 41, 5]
  ].flatMap(([monday, thursday, grade, successful, schoolPresent]) => [
    { type: 'school', date: thursday, source: 'Sample school report', grade, schoolPresent, schoolScheduled: 5 },
    { type: 'training', date: monday, name: 'Passing and puck movement', attendance: 'present',
      attempts: 50, successful, note: 'Practised looking up before receiving the puck.' },
    { type: 'training', date: thursday, name: 'Team practice', attendance: schoolPresent === 4 ? 'absent' : 'present' }
  ])
].map(record => ({
  ...record, athleteId: athlete.id,
  enteredBy: ['reflection', 'nutrition', 'goal'].includes(record.type) ? 'athlete' : 'coach'
}));

const demoTests = {
  height: [58.1, 58.3], weight: [84.2, 85.1],
  'grip-left': [34.2, 35.4, 37.1], 'grip-right': [36.8, 38.1, 39.3],
  'pull-ups': [1, 2, 3], 'broad-jump': [64, 67, 69], 'peak-force': [745, 768, 802],
  'vertical-jump': [9.1, 9.5, 10.2], 'bike-45': [8, 8, 9],
  'sprint-20': [4.04, 3.98, 3.85], 'agility-left': [6.46, 6.39, 6.25],
  'agility-right': [6.58, 6.5, 6.39], 'sprint-ice': [6.56, 6.43, 6.24], transition: [22.5, 21.9, 21.28]
};
const demoReference = {
  'grip-left': 38.6, 'grip-right': 40.1, 'pull-ups': 3.5, 'broad-jump': 72, 'peak-force': 840,
  'vertical-jump': 11.3, 'bike-45': 10, 'sprint-20': 3.78, 'agility-left': 6.17,
  'agility-right': 6.29, 'sprint-ice': 6.12, transition: 20.9
};
const demoDates = ['2026-10-19', '2026-11-02', '2026-11-09'];
const demoMeasurements = Object.entries(demoTests).flatMap(([metricId, values]) =>
  values.map((value, i) => ({
    type: 'measurement', metricId, value, athleteId: athlete.id,
    date: demoDates[demoDates.length - values.length + i], source: 'Fictional sample', enteredBy: 'coach'
  })));
const writers = {
  coach: ['measurement', 'skill', 'training', 'followup', 'school'],
  athlete: ['reflection', 'nutrition', 'goal'],
  parent: []
};
const outcomes = ['independent', 'prompted', 'not yet'];

function observationSummary(body, role) {
  const { story, mode, quality, durationMs, coverage, predictions, beforePx, afterPx, pauses } = body;
  const validQuality = mode === 'pointer' ? quality === 'rehearsal-not-gaze' :
    mode === 'camera' && ['provisional-broad-region-only', 'not-suitable-for-interpretation'].includes(quality);
  const inRange = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  const validError = value => value === null || inRange(value, 100000);
  if (typeof story !== 'string' || !story.trim() || story.length > 120 || !validQuality ||
      !inRange(durationMs, 45000) || !inRange(coverage, 100) || !inRange(predictions, 901) ||
      !validError(beforePx) || !validError(afterPx) || !inRange(pauses, 1000)) {
    throw new Error('The observation summary is invalid.');
  }
  return { story: story.trim(), mode, quality, durationMs, coverage, predictions, beforePx, afterPx, pauses,
    savedAt: new Date().toISOString(), savedBy: role };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

const dateKey = time => new Date(time).toISOString().slice(0, 10);
const recordKey = record => [record.type, record.date, record.type === 'training' ? record.name.toLowerCase() : ''].join('/');
const latestRecord = (records, match) => records.filter(match).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
const countPair = (total, count, max) =>
  Number.isInteger(total) && total >= 1 && total <= max && Number.isInteger(count) && count >= 0 && count <= total;

function summarizeWeek(records, start) {
  const weekStart = dateKey(start);
  const weekEnd = dateKey(start + weekMs - dayMs);
  const weekly = records.filter(record => record.date >= weekStart && record.date <= weekEnd);
  const grade = latestRecord(weekly, record => record.type === 'school' && Number.isFinite(record.grade));
  const schoolAttendance = latestRecord(weekly, record => record.type === 'school' && record.schoolScheduled);
  const training = weekly.filter(record => record.type === 'training' && record.attendance !== 'cancelled');
  const passing = training.filter(record => record.attendance === 'present' && record.attempts);
  const results = passing.length ? passing : weekly.filter(record => record.type === 'skill');
  const nutrition = weekly.filter(record => record.type === 'nutrition');
  return {
    weekStart,
    grade: grade ? { value: grade.grade, source: grade.source, date: grade.date } : null,
    schoolAttendance: schoolAttendance ? { present: schoolAttendance.schoolPresent, scheduled: schoolAttendance.schoolScheduled,
      source: schoolAttendance.source, date: schoolAttendance.date } : null,
    sports: results.length ? {
      attempts: results.reduce((total, record) => total + record.attempts, 0),
      successful: results.reduce((total, record) => total + record.successful, 0),
      basis: passing.length ? 'Training sessions' : 'Passing drill entries'
    } : null,
    training: training.length ? { present: training.filter(record => record.attendance === 'present').length, scheduled: training.length } : null,
    nutrition: {
      days: new Set(nutrition.map(record => record.date)).size,
      hydrated: nutrition.filter(record => record.outcome === 'yes').length,
      mealDays: nutrition.filter(record => record.meals).length,
      regularMeals: nutrition.filter(record => record.meals === 'regular').length
    }
  };
}

function validate(body) {
  const { type, date } = body;
  if (!Number.isFinite(dateValue(date))) throw new Error('Enter a valid date.');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) throw new Error('Keep notes under 500 characters.');
  const record = { type, date, note };
  if (type === 'measurement') {
    const metric = metrics.find(item => item.id === body.metricId);
    const value = body.value;
    if (!metric) throw new Error('Choose a measurement.');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > metric.max ||
        ((metric.timed || metric.category === 'Body') && value === 0) ||
        (metric.integer && !Number.isInteger(value)) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
      throw new Error('Enter a valid ' + metric.name.toLowerCase() + ' result in ' + metric.unit + ' using up to two decimal places.');
    }
    return { ...record, metricId: metric.id, value, source: 'Coach entry' };
  }
  if (type === 'training') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) throw new Error('Enter a session name up to 80 characters.');
    const { attendance, attempts, successful } = body;
    if (!['present', 'absent', 'cancelled'].includes(attendance)) throw new Error('Choose an attendance status.');
    if (attempts !== undefined || successful !== undefined) {
      if (attendance !== 'present' || !countPair(attempts, successful, 1000)) {
        throw new Error('For an attended session, enter 1–1,000 passing attempts and a successful pass count within that range.');
      }
      return { ...record, name, attendance, attempts, successful };
    }
    return { ...record, name, attendance };
  }
  if (type === 'skill') {
    const { attempts, successful } = body;
    if (!countPair(attempts, successful, 100)) {
      throw new Error('Enter 1–100 attempts and a success count within that range.');
    }
    return { ...record, attempts, successful };
  }
  if (type === 'followup' || type === 'nutrition') {
    const allowed = type === 'followup' ? outcomes : ['yes', 'no'];
    if (!allowed.includes(body.outcome)) throw new Error('Choose a result.');
    if (type === 'nutrition' && body.meals !== undefined) {
      if (!['regular', 'missed'].includes(body.meals)) throw new Error('Choose a meal check-in response.');
      return { ...record, outcome: body.outcome, meals: body.meals };
    }
    return { ...record, outcome: body.outcome };
  }
  if (type === 'school') {
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (!source || source.length > 80) throw new Error('Enter the source of the school update.');
    const { grade, schoolPresent, schoolScheduled } = body;
    if (grade !== undefined && (!Number.isFinite(grade) || grade < 0 || grade > 100)) throw new Error('Enter a grade from 0 to 100.');
    const hasAttendance = schoolPresent !== undefined || schoolScheduled !== undefined;
    if (hasAttendance && !countPair(schoolScheduled, schoolPresent, 7)) throw new Error('Enter 1–7 school days and the number attended.');
    if (grade === undefined && !hasAttendance && !note) throw new Error('Enter a grade, attendance, or a school note.');
    return { ...record, source, grade, schoolPresent, schoolScheduled };
  }
  if (!note) throw new Error('Enter an update.');
  if (type === 'goal') {
    if (!['working', 'achieved'].includes(body.status)) throw new Error('Choose a goal status.');
    return { ...record, status: body.status };
  }
  return record;
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Expected JSON.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error('Entry is too large.');
  }
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid entry.');
  return parsed;
}

export function createPilot(env = process.env, { localPreview = false } = {}) {
  const dataFile = env.PILOT_DATA_FILE;
  const publicDemo = !localPreview && env.PILOT_DEMO === 'true' && env.PILOT_OPEN_DEMO === 'true' && !dataFile;
  const openDemo = localPreview || publicDemo;
  const codes = Object.fromEntries(roles.map(role => [role, env['PILOT_' + role.toUpperCase() + '_CODE']]));
  const distinctCodes = new Set(Object.values(codes)).size === roles.length;
  const fourDigitCodes = !openDemo && env.PILOT_DEMO === 'true' && !dataFile &&
    distinctCodes && roles.every(role => /^[0-9]{4}$/.test(codes[role] ?? ''));
  const enabled = openDemo || fourDigitCodes || (distinctCodes && roles.every(role => codes[role]?.length >= 16));

  const hostedDemo = enabled && env.PILOT_DEMO === 'true';
  const demoData = localPreview || hostedDemo;
  const shareNutrition = env.PILOT_SHARE_NUTRITION === 'true';
  let records = enabled && dataFile && existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : structuredClone(sample);
  if (demoData) {
    const recordedDays = new Set(records.map(recordKey));
    records = [...records, ...demoWeeklyUpdates.filter(record => !recordedDays.has(recordKey(record)))];
    if (!records.some(record => record.type === 'measurement')) records.push(...demoMeasurements);
  }
  const sessions = new Map();
  const failures = new Map();
  const sharedWorkspace = { records, observation: null };
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = value => 'faraday_pilot=' + value + '; Path=/pilot; HttpOnly; SameSite=Strict' + secure;
  const digest = value => createHash('sha256').update(value).digest();

  return async function handle(req, res, url, pathname) {
    const studio = pathname === '/pilot/studio';
    if (!studio && !pathname.startsWith('/pilot/api/')) return false;
    if (localPreview && (req.socket.localAddress !== '127.0.0.1' || !/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || ''))) {
      json(res, 403, { error: 'Open the preview at 127.0.0.1.' });
      return true;
    }
    if (pathname === '/pilot/api/setup' && req.method === 'GET') {
      json(res, 200, { enabled, demo: demoData, openDemo, roles, fourDigitCodes });
      return true;
    }
    if (!enabled && !studio) { json(res, 503, { error: 'Pilot sign-in has not been configured.' }); return true; }
    const sessionId = /(?:^|;\s*)faraday_pilot=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
    const previousSession = sessions.get(sessionId);
    const session = previousSession?.expires > Date.now() ? previousSession : null;
    const role = session?.role;

    if (studio) {
      res.setHeader('Cache-Control', 'no-store');
      if (!role) {
        res.writeHead(302, { Location: '/pilot/' });
        res.end();
        return true;
      }
      if (role === 'parent') {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Faraday | Studio access</title><main><h1>Studio access is for coaches and athletes</h1><p>Your weekly learning updates are on the parent dashboard.</p><a href="/pilot/">Return to dashboard</a></main></html>');
        return true;
      }
      return false;
    }

    if (pathname === '/pilot/api/login' && req.method === 'POST') {
      const now = Date.now();
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of failures) if (value.until <= now) failures.delete(key);
      const key = req.socket.remoteAddress;
      const attempts = failures.get(key) || { count: 0, until: now + 60000 };
      if (!openDemo && attempts.count >= 12) { json(res, 429, { error: 'Too many attempts. Try again in a minute.' }); return true; }
      try {
        const input = await readJson(req);
        if (!roles.includes(input.role) || (!openDemo && (typeof input.code !== 'string' ||
            !timingSafeEqual(digest(input.code), digest(codes[input.role]))))) throw new Error();
        const id = randomBytes(32).toString('hex');
        sessions.delete(sessionId);
        const workspace = publicDemo ? session?.workspace ?? { records, observation: null } : sharedWorkspace;
        sessions.set(id, { role: input.role, expires: now + 8 * 3600000, workspace });
        json(res, 200, { role: input.role }, { 'Set-Cookie': cookie(id) + '; Max-Age=28800' });
      } catch {
        if (!openDemo) {
          attempts.count++;
          failures.set(key, attempts);
        }
        json(res, 401, { error: openDemo ? 'Choose a listed role to open the demo.' : 'The role or access code did not match.' });
      }
      return true;
    }
    if (!role) { json(res, 401, { error: 'Sign in to open the pilot.' }); return true; }
    const workspace = session.workspace;

    if (pathname === '/pilot/api/logout' && req.method === 'POST') {
      if (publicDemo) {
        session.role = null;
        json(res, 200, {});
      } else {
        sessions.delete(sessionId);
        json(res, 200, {}, { 'Set-Cookie': cookie('') + '; Max-Age=0' });
      }
    } else if (pathname === '/pilot/api/progress' && req.method === 'GET') {
      const visible = workspace.records.filter(record => {
        if (record.type === 'nutrition') return role === 'athlete' || (role === 'parent' && shareNutrition);
        if (record.type === 'reflection') return role !== 'parent';
        if (record.type === 'goal') return role === 'athlete';
        return true;
      });
      const latest = visible.map(record => record.date).sort().at(-1);
      const date = url.searchParams.get('date') || latest;
      const time = dateValue(date);
      if (!Number.isFinite(time)) { json(res, 400, { error: 'Enter a valid week date.' }); return true; }
      const start = time - ((new Date(time).getUTCDay() + 6) % 7) * dayMs;
      const end = start + weekMs;
      const history = visible.filter(record => record.type === 'skill' && dateValue(record.date) < end)
        .sort((a, b) => a.date.localeCompare(b.date));
      const weekly = visible.filter(record => dateValue(record.date) >= start && dateValue(record.date) < end).map(record => {
        if (role === 'parent' && record.type === 'nutrition') return { type: record.type, date: record.date };
        if (role !== 'coach' && record.type === 'training') {
          const { note, ...session } = record;
          return session;
        }
        return record;
      });
      const weekSummary = summarizeWeek(visible, start);
      if (role !== 'athlete') weekSummary.nutrition = role === 'parent' && shareNutrition ? { days: weekSummary.nutrition.days } : null;
      const trends = role === 'parent' ? [-3, -2, -1, 0].map(offset => {
        const { weekStart, grade, sports } = summarizeWeek(visible, start + offset * weekMs);
        return { weekStart, grade, sports };
      }) : undefined;
      const goal = role === 'athlete' ? latestRecord(visible, record => record.type === 'goal' && dateValue(record.date) < end) : undefined;
      const measurements = visible.filter(record => record.type === 'measurement' && dateValue(record.date) < end)
        .sort((a, b) => a.date.localeCompare(b.date));
      json(res, 200, { role, athlete, shareNutrition, date, history, weekly, measurements, weekSummary, trends, goal, demo: demoData,
        ...(role !== 'parent' ? { observation: workspace.observation } : {}),
        reference: demoData ? demoReference : null,
        weekStart: dateKey(start), weekEnd: dateKey(end - dayMs) });
    } else if (pathname === '/pilot/api/observations' && req.method === 'POST') {
      if (role === 'parent') { json(res, 403, { error: 'This role cannot save an observation.' }); return true; }
      try {
        workspace.observation = observationSummary(await readJson(req), role);
        json(res, 201, { observation: workspace.observation });
      } catch (error) {
        json(res, 400, { error: error.message });
      }
    } else if (pathname === '/pilot/api/entries' && req.method === 'POST') {
      let entry;
      try {
        const input = await readJson(req);
        if (!writers[role].includes(input.type)) { json(res, 403, { error: 'This role cannot add that entry.' }); return true; }
        entry = { ...validate(input), athleteId: athlete.id, enteredBy: role };
      } catch (error) {
        json(res, 400, { error: error.message });
        return true;
      }
      const previous = ['nutrition', 'training'].includes(entry.type)
        ? workspace.records.filter(record => recordKey(record) !== recordKey(entry))
        : workspace.records;
      const next = [...previous, entry];
      try {
        if (dataFile) {
          writeFileSync(dataFile + '.tmp', JSON.stringify(next), { mode: 0o600 });
          renameSync(dataFile + '.tmp', dataFile);
        }
        workspace.records = next;
        json(res, 201, { date: entry.date });
      } catch {
        json(res, 500, { error: 'The entry could not be saved. Try again.' });
      }
    } else {
      json(res, 404, { error: 'Route not found.' });
    }
    return true;
  };
}

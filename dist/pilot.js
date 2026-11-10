import { metrics } from './pilot-metrics.js';
import { renderReport, clearReport } from './pilot-report.js';

const login = document.querySelector('#pilot-login');
const welcome = document.querySelector('#pilot-welcome');
const roleSelect = login.elements.role;
const code = login.elements.code;
const codeField = document.querySelector('#pilot-code-field');
const roleHelp = document.querySelector('#pilot-role-help');
const signIn = login.querySelector('button');
const dashboard = document.querySelector('#pilot-dashboard');
const status = document.querySelector('#pilot-status');
const week = document.querySelector('#pilot-week');
const period = document.querySelector('#pilot-period');
const toolbar = document.querySelector('.pilot-toolbar');
const logout = document.querySelector('#pilot-logout');
const headerNote = document.querySelector('#pilot-header-note');
const summary = document.querySelector('#pilot-summary');
const weeklyOverview = document.querySelector('#pilot-weekly-overview');
const weeklyTrends = document.querySelector('#pilot-weekly-trends');
const trainingLog = document.querySelector('#pilot-training-log');
const forms = document.querySelector('#pilot-forms');
const actions = document.querySelector('#pilot-actions');
const actionButtons = document.querySelector('#pilot-action-buttons');
const actionStatus = document.querySelector('#pilot-action-status');
const title = document.querySelector('#pilot-title');
const reportNav = document.querySelector('.pilot-report-nav');
const addMeasurement = document.querySelector('#pilot-add-measurement');
const observationSummary = document.querySelector('#pilot-observation-summary');
const observationTab = reportNav.querySelector('[data-panel="observation"]');
const studio = document.querySelector('#pilot-studio');
const studioStatus = document.querySelector('#pilot-studio-status');
const openStudio = document.querySelector('#pilot-open-studio');
const panels = {
  report: document.querySelector('#pilot-report'),
  weekly: document.querySelector('#pilot-weekly'),
  observation: document.querySelector('#pilot-eye-tracking'),
  entry: actions
};
let selectedPanel = location.hash === '#eye-tracking' ? 'observation' : undefined;
let studioLoad;
const roleLabels = { coach: 'Coach', athlete: 'Athlete', parent: 'Parent or guardian' };
const demoNames = { coach: 'Taylor Reed', athlete: 'Alex Morgan', parent: 'Jamie Morgan' };
const descriptions = {
  coach: 'Log training sessions, sports results, and school updates.',
  athlete: 'Track your goals and check in on meal and water habits.',
  parent: 'Review your linked athlete’s weekly progress.'
};
const actionLabels = {
  measurement: 'Athlete measurement', skill: 'Practice result', followup: 'Learning check', school: 'School update',
  reflection: 'Practice reflection', nutrition: 'Nutrition check-in', training: 'Training session', goal: 'Personal goal'
};
const outcomeLabels = { independent: 'Applied without a reminder', prompted: 'Applied with a reminder', 'not yet': 'Not yet applied' };
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const dateLabel = value => dateFormat.format(new Date(value + 'T00:00:00Z'));
let loadSequence = 0;
let selectedAction;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function api(path, body) {
  const response = await fetch('/pilot/api/' + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}

function card(title, text, detail = '') {
  return '<article class="pilot-card"><h2>' + escape(title) + '</h2><p>' +
    escape(text) + '</p>' + (detail ? '<p class="pilot-detail">' + escape(detail) + '</p>' : '') + '</article>';
}

function latest(records, type, match = () => true) {
  return records.filter(record => record.type === type && match(record)).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

function form(type, title, fields, date) {
  return '<form class="pilot-card pilot-form" data-type="' + type + '"><h2>' + title +
    '</h2><label>Date <input name="date" type="date" required value="' + escape(date) +
    '"></label>' + fields + '<button type="submit">Save update</button></form>';
}

const notes = '<label>Update <textarea name="note" maxlength="500" required></textarea></label>';
const optionalNotes = '<label>Coach note <textarea name="note" maxlength="500"></textarea></label>';
const percent = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value) + '%';
const passingRate = sports => sports ? 100 * sports.successful / sports.attempts : null;
const attendanceRate = attendance => percent(100 * attendance.present / attendance.scheduled);

function weeklyStat(label, value, detail) {
  return '<article class="pilot-card pilot-weekly-stat"><h3>' + escape(label) + '</h3><p class="pilot-weekly-value">' +
    escape(value ?? '—') + '</p><p class="pilot-detail">' + escape(detail) + '</p></article>';
}

function renderTrends(trends, demo) {
  const series = [
    { label: 'Academic average', style: 'school', values: trends.map(week => week.grade?.value ?? null) },
    { label: 'Passing accuracy', style: 'sport', values: trends.map(week => passingRate(week.sports)) }
  ];
  const point = (value, index) => [58 + index * 154, 134 - value * 1.12];
  const axes = [0, 25, 50, 75, 100].map(value => {
    const [, y] = point(value, 0);
    return '<text x="44" y="' + (y + 4) + '" text-anchor="end">' + value + '%</text>' +
      '<line class="pilot-trend-rule" x1="58" x2="520" y1="' + y + '" y2="' + y + '"/>';
  }).join('');
  const lines = series.map(({ style, values }) => '<g class="pilot-trend-' + style + '">' +
    values.map((value, index) => {
      if (value === null) return '';
      const [x, y] = point(value, index);
      const previous = index && values[index - 1] !== null ? point(values[index - 1], index - 1) : null;
      return (previous ? '<path d="M' + previous.join(' ') + ' L' + x + ' ' + y + '"/>' : '') +
        '<circle cx="' + x + '" cy="' + y + '" r="4"/>';
    }).join('') + '</g>').join('');
  const labels = trends.map(({ weekStart }, index) => '<text x="' + point(0, index)[0] +
    '" y="154" text-anchor="middle">' + escape(trendDate.format(new Date(weekStart + 'T00:00:00Z'))) + '</text>').join('');
  const rows = trends.map(({ weekStart }, index) => '<tr><th scope="row">' + escape(dateLabel(weekStart)) + '</th>' +
    series.map(({ values }) => '<td>' + (values[index] === null ? 'No data' : escape(percent(values[index]))) + '</td>').join('') + '</tr>').join('');
  weeklyTrends.innerHTML = '<h3>Weekly progress overview</h3><p class="pilot-detail">Four weeks ending with the selected week.' +
    (demo ? ' Demo figures start with fictional records.' : '') + '</p>' +
    '<ul class="pilot-trend-key">' + series.map(({ style, label }) => '<li class="pilot-trend-' + style + '">' + label + '</li>').join('') + '</ul>' +
    '<svg viewBox="0 0 570 165" aria-hidden="true">' + axes + lines + labels + '</svg>' +
    '<details><summary>See weekly values</summary><div class="pilot-table-wrap"><table><thead><tr><th scope="col">Week of</th>' +
    series.map(({ label }) => '<th scope="col">' + label + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></details>';
}

const trendDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function renderWeeklyOverview(data) {
  const { role, weekSummary: { grade, schoolAttendance, sports, training, nutrition }, weekly, goal } = data;
  const parent = role === 'parent';
  const count = record => record.present + ' of ' + record.scheduled;
  weeklyOverview.innerHTML = (parent ? weeklyStat('Academic average', grade && percent(grade.value),
    grade ? grade.source + ' · ' + dateLabel(grade.date) : 'No grade recorded this week.') +
    weeklyStat('School attendance', schoolAttendance && attendanceRate(schoolAttendance),
      schoolAttendance ? count(schoolAttendance) + ' school days · ' + schoolAttendance.source : 'No school attendance recorded this week.') : '') +
    weeklyStat('Sports progress · Passing', sports && percent(passingRate(sports)),
      sports ? sports.successful + ' of ' + sports.attempts + ' passes · ' + sports.basis : 'No passing scores recorded this week.') +
    weeklyStat('Training attendance', training && attendanceRate(training),
      training ? count(training) + ' logged sessions attended' : 'No attendance recorded this week.') +
    (nutrition ? weeklyStat('Nutrition check-ins', nutrition.days + ' / 7 days', parent ? 'Shared weekly count' :
      (nutrition.days ? 'Brought a water bottle on ' + nutrition.hydrated + ' of ' + nutrition.days + ' logged days. ' +
      (nutrition.mealDays ? 'Regular meals on ' + nutrition.regularMeals + ' of ' + nutrition.mealDays + ' answered days.' : 'No meal responses yet.') :
      'Log a meal or water habit from Add an update.')) : '') +
    (role === 'athlete' ? card('My goal', goal?.note || 'Set a personal goal from Add an update.',
      goal ? (goal.status === 'achieved' ? 'Achieved' : 'In progress') + ' · ' + dateLabel(goal.date) + ' · Only you can see this' : '') : '');
  weeklyTrends.hidden = !parent;
  if (parent) renderTrends(data.trends, data.demo);
  else weeklyTrends.innerHTML = '';
  trainingLog.hidden = parent;
  if (parent) trainingLog.innerHTML = '';
  else {
    const sessions = weekly.filter(record => record.type === 'training').sort((a, b) => a.date.localeCompare(b.date));
    const statuses = { present: 'Attended', absent: 'Missed', cancelled: 'Cancelled' };
    const rows = sessions.map(record => '<tr><td>' + escape(dateLabel(record.date)) + '</td><th scope="row">' + escape(record.name) +
      (record.note ? '<span class="pilot-detail pilot-training-note">' + escape(record.note) + '</span>' : '') + '</th><td>' +
      statuses[record.attendance] + '</td><td>' + (record.attempts ? record.successful + ' of ' + record.attempts : '—') + '</td></tr>').join('');
    trainingLog.innerHTML = '<h3>Training sessions</h3>' + (rows ?
      '<div class="pilot-table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Attendance</th><th scope="col">Successful passes</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' : '<p class="pilot-detail">No training sessions logged this week.</p>');
  }
}

function updateSignInHint() {
  roleHelp.textContent = descriptions[roleSelect.value];
  code.value = '';
}

function selectAction(type) {
  selectedAction = type;
  for (const button of actionButtons.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.action === type));
  }
  for (const entry of forms.querySelectorAll('form')) entry.hidden = entry.dataset.type !== type;
}

function selectPanel(panel) {
  if (panel !== 'observation') closeStudio();
  selectedPanel = panel;
  toolbar.hidden = panel === 'observation';
  for (const [key, section] of Object.entries(panels)) section.hidden = key !== panel;
  for (const button of reportNav.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.panel === panel));
  }
}

function closeStudio() {
  if (studio.hidden) return;
  window.dispatchEvent(new Event('faraday:close-studio'));
  studio.hidden = true;
  studioStatus.textContent = '';
  openStudio.disabled = false;
  openStudio.setAttribute('aria-expanded', 'false');
}

function setMeasurementUnit() {
  const entry = forms.querySelector('[data-type="measurement"]');
  const metric = metrics.find(item => item.id === entry.elements.metricId.value);
  entry.querySelector('[data-result-label]').textContent = 'Result (' + metric.unit + ')';
  const field = entry.elements.value;
  field.max = metric.max;
  field.step = metric.integer ? '1' : '0.01';
  field.min = metric.timed || metric.category === 'Body' ? '0.01' : '0';
}

function renderObservation(observation) {
  if (!observation) {
    observationSummary.textContent = 'After a reading activity, choose Save to dashboard to see the summary here.';
    return;
  }
  const quality = {
    'rehearsal-not-gaze': 'Pointer practice',
    'provisional-broad-region-only': 'Camera checks passed',
    'not-suitable-for-interpretation': 'Camera results unverified'
  };
  const pixels = value => value === null ? 'Not checked' : value + ' px';
  const results = {
    'Active time': (observation.durationMs / 1000).toFixed(1) + ' s',
    'Time tracked': observation.coverage + '%',
    'Readings': observation.predictions,
    'Typical distance before reading': pixels(observation.beforePx),
    'Typical distance after reading': pixels(observation.afterPx),
    'Pauses': observation.pauses
  };
  observationSummary.innerHTML = '<p class="pilot-observation-story"><strong>' + escape(observation.story) + '</strong> ' +
    '<span class="pilot-observation-quality" data-quality="' + escape(observation.quality) + '">' +
    escape(quality[observation.quality]) + '</span></p><p class="pilot-detail">Saved by ' +
    escape(roleLabels[observation.savedBy]) + ' · ' + escape(new Date(observation.savedAt).toLocaleString()) +
    '</p><dl class="pilot-metric-change pilot-observation-metrics">' +
    Object.entries(results).map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl>';
}

function render(data) {
  const { role, athlete, history, weekly, weekStart, weekEnd } = data;
  title.textContent = athlete.name;
  document.querySelector('#pilot-view-label').textContent = role === 'parent' ? 'Parent dashboard' : roleLabels[role] + ' dashboard';
  document.querySelector('#pilot-intro').textContent = [athlete.team, athlete.position, athlete.season].filter(Boolean).join(' · ');
  period.textContent = dateLabel(weekStart) + ' to ' + dateLabel(weekEnd);
  week.value = weekStart;
  observationTab.hidden = role === 'parent';
  document.querySelector('#pilot-parent-summary-note').hidden = role !== 'parent';
  document.querySelector('#pilot-demo-note').hidden = !data.demo;
  renderObservation(data.observation);
  renderWeeklyOverview(data);
  const followup = latest(weekly, 'followup');
  const school = latest(weekly, 'school', record => record.note);
  const score = record => record.successful + ' of ' + record.attempts;
  summary.innerHTML = card('Skill learning · Apply the cue later', followup ? outcomeLabels[followup.outcome] + ' · ' + dateLabel(followup.date) : 'Follow-up check pending.', followup?.note) +
    card('Academic progress · Weekly update', school?.note || 'No school update this week.', school ? school.source + ' · ' + dateLabel(school.date) : '');
  if (role !== 'parent') {
    const reflection = latest(weekly, 'reflection');
    summary.innerHTML += card('Athlete reflection', reflection?.note || 'No reflection this week.', reflection?.date);
  }
  document.querySelector('#pilot-passing-history').hidden = role === 'parent';
  document.querySelector('#pilot-history').innerHTML = history.map(record =>
    '<tr><td>' + escape(dateLabel(record.date)) + '</td><td>' + escape(score(record)) + '</td><td>' + escape(record.note || '—') + '</td></tr>').join('') ||
    '<tr><td colspan="3">No results for this period.</td></tr>';
  forms.innerHTML = '';
  if (role === 'coach') {
    const options = metrics.map(metric => '<option value="' + metric.id + '">' +
      metric.name + ' · ' + metric.unit + '</option>').join('');
    forms.innerHTML = form('training', 'Log a training session',
      '<label>Session name <input name="name" maxlength="80" placeholder="e.g. Tuesday team practice" required></label>' +
      '<label>Attendance <select name="attendance"><option value="present">Attended</option><option value="absent">Missed</option><option value="cancelled">Cancelled</option></select></label>' +
      '<fieldset><legend>Passing drill (optional)</legend><p class="pilot-detail">Enter both numbers if you tested passing during this session.</p>' +
      '<label>Attempts <input name="attempts" type="number" min="1" max="1000"></label>' +
      '<label>Successful passes <input name="successful" type="number" min="0" max="1000"></label></fieldset>' + optionalNotes, data.date) +
      form('measurement', 'Record an athlete measurement',
      '<label>Test <select name="metricId">' + options + '</select></label>' +
      '<label><span data-result-label>Result</span><input name="value" type="number" inputmode="decimal" required></label>' +
      optionalNotes, data.date) + form('skill', 'Log a passing drill',
      '<label>Attempts <input name="attempts" type="number" min="1" max="100" required></label>' +
      '<label>Successful passes <input name="successful" type="number" min="0" max="100" required></label>' + optionalNotes, data.date) +
      form('followup', 'Check the learning cue',
        '<label>Did the athlete apply the cue? <select name="outcome"><option value="independent">Independently</option><option value="prompted">With a prompt</option><option value="not yet">Not yet</option></select></label>' +
        optionalNotes, data.date) +
      form('school', 'Add a school update from an agreed source',
        '<label>Source <input name="source" maxlength="80" placeholder="e.g. Teacher’s weekly report" required></label>' +
        '<label>Academic average (%) <input name="grade" type="number" min="0" max="100" step="0.1"></label>' +
        '<fieldset><legend>School attendance (optional)</legend><p class="pilot-detail">Use totals for the selected school week.</p>' +
        '<label>Days scheduled <input name="schoolScheduled" type="number" min="1" max="7"></label>' +
        '<label>Days attended <input name="schoolPresent" type="number" min="0" max="7"></label></fieldset>' +
        '<label>School note <textarea name="note" maxlength="500"></textarea></label>', data.date);
  } else if (role === 'athlete') {
    forms.innerHTML = form('goal', 'Set or update your personal goal',
      '<label>My goal <textarea name="note" maxlength="500" placeholder="e.g. Look up before passing at the next practice" required>' +
      escape(data.goal?.note) + '</textarea></label>' +
      '<label>Status <select name="status"><option value="working">In progress</option><option value="achieved"' +
      (data.goal?.status === 'achieved' ? ' selected' : '') + '>Achieved</option></select></label>', data.date) +
      form('nutrition', 'Daily nutrition check-in',
        '<p class="pilot-detail">One check-in per day. Saving again replaces that day’s answers.</p>' +
        '<label>Did you bring a water bottle today? <select name="outcome" required><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>' +
        '<label>Were you able to eat your usual meals? <select name="meals"><option value="">Skip this question</option><option value="regular">Yes</option><option value="missed">I missed a meal</option></select></label>', data.date) +
      form('reflection', 'Reflect on practice', notes, data.date);
  }
  const types = [...forms.querySelectorAll('form')].map(entry => entry.dataset.type);
  reportNav.querySelector('[data-panel="entry"]').hidden = !types.length;
  addMeasurement.hidden = role !== 'coach';
  if (role === 'coach') setMeasurementUnit();
  renderReport(data);
  if (!selectedPanel || (selectedPanel === 'entry' && !types.length) || (selectedPanel === 'observation' && observationTab.hidden)) {
    selectedPanel = role === 'parent' ? 'weekly' : 'report';
  }
  selectPanel(selectedPanel);
  actionButtons.innerHTML = types.map(type =>
    '<button type="button" data-action="' + type + '" aria-pressed="false">' + actionLabels[type] + '</button>').join('');
  selectAction(types.includes(selectedAction) ? selectedAction : types[0]);
  welcome.hidden = true;
  dashboard.hidden = false;
  logout.hidden = false;
  headerNote.hidden = true;
}

async function load(date) {
  const sequence = ++loadSequence;
  try {
    const data = await api('progress' + (date ? '?date=' + encodeURIComponent(date) : ''));
    if (sequence === loadSequence) render(data);
  } catch (error) {
    if (sequence !== loadSequence) return;
    if (error.status === 401 || error.status === 503) {
      closeStudio();
      dashboard.hidden = true;
      welcome.hidden = false;
      logout.hidden = true;
      headerNote.hidden = false;
      summary.replaceChildren();
      weeklyOverview.replaceChildren();
      weeklyTrends.replaceChildren();
      trainingLog.replaceChildren();
      observationSummary.replaceChildren();
      clearReport();
      forms.replaceChildren();
      document.querySelector('#pilot-history').replaceChildren();
      title.textContent = 'Athlete progress';
      document.querySelector('#pilot-view-label').textContent = 'Faraday hockey demo';
      document.querySelector('#pilot-intro').textContent = 'Explore a sample athlete’s progress in practice and at school.';
    }
    if (error.status !== 401) status.textContent = error.message;
  }
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  status.textContent = '';
  try {
    await api('login', Object.fromEntries(new FormData(login)));
    login.reset();
    updateSignInHint();
    await load();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

roleSelect.addEventListener('change', updateSignInHint);
week.addEventListener('change', () => {
  actionStatus.textContent = '';
  load(week.value);
});
reportNav.addEventListener('click', event => {
  const button = event.target.closest('[data-panel]');
  if (button) selectPanel(button.dataset.panel);
});
openStudio.addEventListener('click', async () => {
  studio.hidden = false;
  openStudio.disabled = true;
  openStudio.setAttribute('aria-expanded', 'true');
  studioStatus.textContent = 'Loading the observation desk…';
  try {
    studioLoad ??= Promise.all([import('/reliability.js?v=12'), import('/stories.js?v=7'), import('/gaze-model.js?v=3')])
      .then(() => import('/app.js?v=18'));
    await studioLoad;
    if (!studio.hidden) {
      studioStatus.textContent = '';
      studio.focus();
    }
  } catch {
    studioLoad = undefined;
    closeStudio();
    studioStatus.textContent = 'The observation desk could not load. Try again.';
  }
});
document.querySelector('#pilot-close-studio').addEventListener('click', () => {
  closeStudio();
  openStudio.focus();
});
window.addEventListener('faraday:observation-saved', event => {
  if (!dashboard.hidden && !observationTab.hidden) renderObservation(event.detail);
});
addMeasurement.addEventListener('click', () => {
  selectPanel('entry');
  selectAction('measurement');
  forms.querySelector('[name="metricId"]').focus();
});
forms.addEventListener('change', event => {
  if (event.target.name === 'metricId') setMeasurementUnit();
  if (event.target.name === 'attendance') {
    event.target.form.querySelector('fieldset').disabled = event.target.value !== 'present';
  }
});
actionButtons.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) {
    actionStatus.textContent = '';
    selectAction(button.dataset.action);
  }
});
forms.addEventListener('submit', async event => {
  event.preventDefault();
  const element = event.target;
  const button = element.querySelector('button');
  const entry = { ...Object.fromEntries(new FormData(element)), type: element.dataset.type };
  if (entry.type === 'measurement') entry.value = Number(entry.value);
  for (const name of ['attempts', 'successful', 'grade', 'schoolScheduled', 'schoolPresent']) {
    if (entry[name] === '') delete entry[name];
    else if (name in entry) entry[name] = Number(entry[name]);
  }
  if (entry.meals === '') delete entry.meals;
  button.disabled = true;
  actionStatus.textContent = '';
  try {
    await api('entries', entry);
    actionStatus.textContent = 'Update saved.';
    await load(entry.date);
  } catch (error) {
    actionStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  try {
    await api('logout', {});
    closeStudio();
    selectedAction = undefined;
    selectedPanel = undefined;
    actionStatus.textContent = '';
    status.textContent = 'Signed out. Choose a role to continue.';
    await load();
  } catch (error) {
    status.textContent = error.message;
  }
});

async function initialize() {
  try {
    const setup = await api('setup');
    if (!setup.enabled) {
      status.textContent = 'Pilot sign-in has not been configured.';
      return;
    }
    for (const option of [...roleSelect.options]) {
      if (!setup.roles.includes(option.value)) {
        option.remove();
        continue;
      }
      option.hidden = false;
      if (setup.demo) option.textContent = roleLabels[option.value] + ' · ' + demoNames[option.value];
    }
    codeField.hidden = setup.openDemo;
    code.disabled = setup.openDemo;
    if (setup.openDemo) {
      document.querySelector('#pilot-login-title').textContent = 'Choose your demo view';
    } else if (setup.fourDigitCodes) {
      codeField.querySelector('span').textContent = '4-digit access code';
      code.inputMode = 'numeric';
      code.pattern = '[0-9]{4}';
      code.maxLength = 4;
    }
    updateSignInHint();
    signIn.disabled = false;
    await load();
  } catch (error) {
    status.textContent = error.message;
  }
}

initialize();
window.addEventListener('pageshow', event => {
  if (event.persisted) load(week.value);
});

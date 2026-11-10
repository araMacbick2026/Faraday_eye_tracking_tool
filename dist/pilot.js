import { metrics } from './pilot-metrics.js';
import { renderReport, clearReport } from './pilot-report.js';

const login = document.querySelector('#pilot-login');
const welcome = document.querySelector('#pilot-welcome');
const roleSelect = login.elements.role;
const code = login.elements.code;
const codeField = document.querySelector('#pilot-code-field');
const roleHelp = document.querySelector('#pilot-role-help');
const codeHelp = document.querySelector('#pilot-code-help');
const signIn = login.querySelector('button');
const dashboard = document.querySelector('#pilot-dashboard');
const status = document.querySelector('#pilot-status');
const week = document.querySelector('#pilot-week');
const period = document.querySelector('#pilot-period');
const summary = document.querySelector('#pilot-summary');
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
let selectedPanel = location.hash === '#eye-tracking' ? 'observation' : 'report';
let studioLoad;
const roleLabels = { coach: 'Coach', athlete: 'Athlete', parent: 'Parent or guardian' };
const demoNames = { coach: 'Taylor Reed', athlete: 'Alex Morgan', parent: 'Jamie Morgan' };
const descriptions = {
  coach: 'Record skill results and follow-up checks.',
  athlete: 'Add a practice reflection or a habit check-in.',
  parent: 'Review your linked athlete’s weekly progress.'
};
const actionLabels = {
  measurement: 'Athlete measurement', skill: 'Practice result', followup: 'Learning check', school: 'School update',
  reflection: 'Practice reflection', nutrition: 'Nutrition check-in'
};
const outcomeLabels = { independent: 'Applied without a reminder', prompted: 'Applied with a reminder', 'not yet': 'Not yet applied' };
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const dateLabel = value => dateFormat.format(new Date(value + 'T00:00:00Z'));
let loadSequence = 0;
let demoPins = null;
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

function latest(records, type) {
  return records.filter(record => record.type === type).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

function form(type, title, fields, date) {
  return '<form class="pilot-card pilot-form" data-type="' + type + '"><h2>' + title +
    '</h2><label>Date <input name="date" type="date" required value="' + escape(date) +
    '"></label>' + fields + '<button type="submit">Save update</button></form>';
}

const notes = '<label>Update <textarea name="note" maxlength="500" required></textarea></label>';
const optionalNotes = '<label>Coach note <textarea name="note" maxlength="500"></textarea></label>';

function updateSignInHint() {
  roleHelp.textContent = descriptions[roleSelect.value];
  code.value = demoPins?.[roleSelect.value] ?? '';
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
  week.closest('label').hidden = panel === 'observation';
  period.hidden = panel === 'observation';
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
    observationSummary.textContent = 'No observation saved yet. Finish an activity and choose Save summary in the studio.';
    return;
  }
  const quality = {
    'rehearsal-not-gaze': 'Pointer rehearsal only',
    'provisional-broad-region-only': 'Webcam · provisional broad-region estimates',
    'not-suitable-for-interpretation': 'Webcam quality check incomplete or failed'
  };
  const pixels = value => value === null ? 'Not checked' : value + ' px';
  const results = {
    'Active time': (observation.durationMs / 1000).toFixed(1) + ' s',
    'Fresh signal coverage': observation.coverage + '%',
    'Unique predictions': observation.predictions,
    'Median error before': pixels(observation.beforePx),
    'Median error after': pixels(observation.afterPx),
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
  title.textContent = athlete.name + ' · ' + roleLabels[role] + ' view';
  document.querySelector('#pilot-intro').textContent = [athlete.team, athlete.position, athlete.season].filter(Boolean).join(' · ');
  period.textContent = dateLabel(weekStart) + ' to ' + dateLabel(weekEnd);
  week.value = weekStart;
  observationTab.hidden = role === 'parent';
  renderObservation(data.observation);
  const baseline = history[0];
  const result = latest(weekly, 'skill');
  const followup = latest(weekly, 'followup');
  const school = latest(weekly, 'school');
  const nutrition = weekly.filter(record => record.type === 'nutrition');
  const score = record => record.successful + ' of ' + record.attempts;
  summary.innerHTML = card('Sports · Passing accuracy', result ? score(result) + ' passes on ' + dateLabel(result.date) : 'No practice result this week.',
    baseline ? 'First result: ' + score(baseline) + ' on ' + dateLabel(baseline.date) + (result?.note ? ' · ' + result.note : '') : '') +
    card('Learning · Use the cue later', followup ? outcomeLabels[followup.outcome] + ' · ' + dateLabel(followup.date) : 'Follow-up check pending.', followup?.note) +
    card('School · Weekly update', school?.note || 'No school update this week.', school ? school.source + ' · ' + dateLabel(school.date) : '');
  if (role !== 'parent') {
    const reflection = latest(weekly, 'reflection');
    summary.innerHTML += card('Athlete reflection', reflection?.note || 'No reflection this week.', reflection?.date);
  }
  if (role === 'athlete' || (role === 'parent' && data.shareNutrition)) {
    summary.innerHTML += card('Nutrition · Bring a water bottle',
      nutrition.length ? nutrition.filter(record => record.outcome === 'yes').length + ' yes out of ' + nutrition.length + ' recorded check-ins.' : 'No check-ins this week.',
      'Check-ins are reported by the athlete.');
  }
  document.querySelector('#pilot-history').innerHTML = history.map(record =>
    '<tr><td>' + escape(dateLabel(record.date)) + '</td><td>' + escape(score(record)) + '</td></tr>').join('') ||
    '<tr><td colspan="2">No results for this period.</td></tr>';
  forms.innerHTML = '';
  if (role === 'coach') {
    const options = metrics.map(metric => '<option value="' + metric.id + '">' +
      metric.name + ' · ' + metric.unit + '</option>').join('');
    forms.innerHTML = form('measurement', 'Record an athlete measurement',
      '<label>Test <select name="metricId">' + options + '</select></label>' +
      '<label><span data-result-label>Result</span><input name="value" type="number" inputmode="decimal" required></label>' +
      optionalNotes, data.date) + form('skill', 'Log a passing drill',
      '<label>Attempts <input name="attempts" type="number" min="1" max="100" required></label>' +
      '<label>Successful passes <input name="successful" type="number" min="0" max="100" required></label>' + optionalNotes, data.date) +
      form('followup', 'Check the learning cue',
        '<label>Did the athlete apply the cue? <select name="outcome"><option value="independent">Independently</option><option value="prompted">With a prompt</option><option value="not yet">Not yet</option></select></label>' +
        optionalNotes, data.date) +
      form('school', 'Add a school update from an agreed source',
        '<label>Source <input name="source" maxlength="80" required></label>' + notes, data.date);
  } else if (role === 'athlete') {
    forms.innerHTML = form('reflection', 'Reflect on practice', notes, data.date) +
      form('nutrition', 'Water bottle check-in',
        '<label>Did you bring a water bottle? <select name="outcome"><option value="yes">Yes</option><option value="no">No</option></select></label>', data.date);
  }
  const types = [...forms.querySelectorAll('form')].map(entry => entry.dataset.type);
  reportNav.querySelector('[data-panel="entry"]').hidden = !types.length;
  addMeasurement.hidden = role !== 'coach';
  if (role === 'coach') setMeasurementUnit();
  renderReport(data);
  if (selectedPanel === 'entry' && !types.length || selectedPanel === 'observation' && observationTab.hidden) {
    selectedPanel = 'report';
  }
  selectPanel(selectedPanel);
  actionButtons.innerHTML = types.map(type =>
    '<button type="button" data-action="' + type + '" aria-pressed="false">' + actionLabels[type] + '</button>').join('');
  selectAction(types.includes(selectedAction) ? selectedAction : types[0]);
  welcome.hidden = true;
  dashboard.hidden = false;
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
      summary.replaceChildren();
      observationSummary.replaceChildren();
      clearReport();
      forms.replaceChildren();
      document.querySelector('#pilot-history').replaceChildren();
      title.textContent = 'Athlete progress';
      document.querySelector('#pilot-intro').textContent = 'Try the coach, athlete, or family view with one sample athlete.';
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
    studioLoad ??= Promise.all([import('/reliability.js?v=7'), import('/stories.js?v=7')])
      .then(() => import('/app.js?v=9'));
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
  if (entry.type === 'skill') {
    entry.attempts = Number(entry.attempts);
    entry.successful = Number(entry.successful);
  }
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

document.querySelector('#pilot-logout').addEventListener('click', async () => {
  try {
    await api('logout', {});
    closeStudio();
    selectedAction = undefined;
    selectedPanel = 'report';
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
    demoPins = setup.demoPins;
    if (demoPins || setup.demo) {
      for (const option of roleSelect.options) {
        option.textContent = roleLabels[option.value] + ' · ' + demoNames[option.value];
      }
    }
    if (demoPins) {
      codeField.hidden = true;
      code.autocomplete = 'off';
      codeHelp.hidden = false;
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

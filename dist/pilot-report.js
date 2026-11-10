import { metrics, displayNumber, measurementChange } from './pilot-metrics.js';

const filters = document.querySelector('#pilot-categories');
const cards = document.querySelector('#pilot-metrics');
const detail = document.querySelector('#pilot-metric-detail');
const comparison = document.querySelector('#pilot-comparison');
const comparisonRows = document.querySelector('#pilot-comparison-rows');
const categories = ['All metrics', ...new Set(metrics.map(metric => metric.category))];
let category = categories[0];
let activeMetric;
let records = [];
let reference = null;

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const displayDate = value => date.format(new Date(value + 'T00:00:00Z'));
const series = id => records.filter(record => record.metricId === id);
const filteredMetrics = () => metrics.filter(metric => category === categories[0] || metric.category === category);
const text = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function trend(metric, results) {
  const times = results.map(result => Date.parse(result.date + 'T00:00:00Z'));
  const values = results.map(result => result.value);
  const first = times[0];
  const span = times.at(-1) - first;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = results.map((result, i) => [
    span ? 30 + (times[i] - first) / span * 540 : 300,
    max === min ? 67 : 111 - (result.value - min) / (max - min) * 88
  ]);
  const dots = points.map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="5"/>').join('');
  const line = points.length > 1 ? '<polyline points="' + points.map(point => point.join(',')).join(' ') + '"/>' : '';
  return '<figure class="pilot-trend"><svg viewBox="0 0 600 138" role="img" aria-label="' +
    text(metric.name + ' history, ' + results.length + ' measurement' + (results.length === 1 ? '' : 's')) +
    '"><path d="M30 23H570 M30 67H570 M30 111H570"/>' + line + dots +
    '</svg><figcaption>' + text(displayDate(results[0].date)) +
    (span ? ' to ' + text(displayDate(results.at(-1).date)) : '') +
    ' · ' + text(displayNumber(min)) + (max !== min ? ' to ' + text(displayNumber(max)) : '') + ' ' + metric.unit + '</figcaption></figure>';
}

function renderDetail() {
  const metric = metrics.find(item => item.id === activeMetric);
  const results = series(activeMetric);
  detail.hidden = !metric || !results.length;
  if (detail.hidden) { detail.replaceChildren(); return; }
  const rows = [...results].reverse().map(result => '<tr><td>' + text(displayDate(result.date)) +
    '</td><td>' + text(displayNumber(result.value)) + ' ' + metric.unit + '</td><td>' +
    text(result.source || 'Coach entry') + '</td><td>' + text(result.note || '—') + '</td></tr>').join('');
  detail.innerHTML = '<h2 tabindex="-1">' + metric.name + ' history</h2>' + trend(metric, results) +
    '<div class="pilot-table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Result</th>' +
    '<th scope="col">Source</th><th scope="col">Note</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function render() {
  filters.innerHTML = categories.map(item => '<button type="button" data-category="' + item +
    '" aria-pressed="' + (item === category) + '">' + item + '</button>').join('');
  cards.innerHTML = filteredMetrics().map(metric => {
    const results = series(metric.id);
    const latest = results.at(-1);
    const baseline = results.length > 1 ? results[0].value : undefined;
    const previous = results.at(-2)?.value;
    return '<article class="pilot-card pilot-metric"><div class="pilot-metric-top"><h3>' + metric.name +
      '</h3><span>' + metric.category + '</span></div>' + (latest
      ? '<p class="pilot-metric-number">' + text(displayNumber(latest.value)) + ' <small>' + metric.unit +
        '</small></p><p class="pilot-detail">' + text(displayDate(latest.date)) + '</p>' +
        '<dl class="pilot-metric-change"><div><dt>Since baseline</dt><dd>' + measurementChange(latest.value, baseline, metric.unit) +
        '</dd></div><div><dt>Since previous</dt><dd>' + measurementChange(latest.value, previous, metric.unit) +
        '</dd></div></dl><button type="button" class="pilot-history-button" data-metric="' + metric.id +
        '" aria-label="View ' + metric.name + ' history">View history →</button>'
      : '<p class="pilot-detail">No measurement recorded.</p>') + '</article>';
  }).join('');
  renderDetail();
  comparisonRows.innerHTML = reference ? filteredMetrics().map(metric => {
    const latest = series(metric.id).at(-1);
    const target = reference[metric.id];
    if (!latest || target === undefined) return '';
    return '<tr><th scope="row">' + metric.name + '</th><td>' + text(displayNumber(latest.value)) + ' ' + metric.unit +
      '</td><td>' + text(displayNumber(target)) + ' ' + metric.unit + '</td><td>' +
      measurementChange(latest.value, target, metric.unit) + '</td></tr>';
  }).join('') : '';
  comparison.hidden = !comparisonRows.children.length;
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  category = button.dataset.category;
  activeMetric = undefined;
  render();
  filters.querySelector('[aria-pressed="true"]').focus();
});
cards.addEventListener('click', event => {
  const button = event.target.closest('[data-metric]');
  if (!button) return;
  activeMetric = button.dataset.metric;
  renderDetail();
  detail.querySelector('h2').focus();
});

export function renderReport(data) {
  records = data.measurements;
  reference = data.reference;
  render();
}


export function clearReport() {
  records = [];
  reference = null;
  category = categories[0];
  activeMetric = undefined;
  cards.replaceChildren();
  detail.replaceChildren();
  detail.hidden = true;
  comparisonRows.replaceChildren();
  comparison.hidden = true;
}

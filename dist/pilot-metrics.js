export const metrics = [
  { id: 'height', name: 'Height', category: 'Body', unit: 'in', max: 100 },
  { id: 'weight', name: 'Weight', category: 'Body', unit: 'lb', max: 1000 },
  { id: 'grip-left', name: 'Grip (left)', category: 'Strength', unit: 'lb', max: 1000 },
  { id: 'grip-right', name: 'Grip (right)', category: 'Strength', unit: 'lb', max: 1000 },
  { id: 'pull-ups', name: 'Pull-ups', category: 'Strength', unit: 'reps', max: 200, integer: true },
  { id: 'broad-jump', name: 'Broad jump', category: 'Explosiveness', unit: 'in', max: 300 },
  { id: 'peak-force', name: 'Peak propulsive force', category: 'Explosiveness', unit: 'N', max: 20000 },
  { id: 'vertical-jump', name: 'Vertical jump', category: 'Explosiveness', unit: 'in', max: 100 },
  { id: 'bike-45', name: '45-second bike test', category: 'Endurance', unit: 'cal', max: 200 },
  { id: 'sprint-20', name: '20-yard sprint', category: 'Speed', unit: 's', max: 120, timed: true },
  { id: 'agility-left', name: 'Pro agility (left)', category: 'Speed', unit: 's', max: 120, timed: true },
  { id: 'agility-right', name: 'Pro agility (right)', category: 'Speed', unit: 's', max: 120, timed: true },
  { id: 'sprint-ice', name: '30-meter on-ice sprint', category: 'On-ice', unit: 's', max: 120, timed: true },
  { id: 'transition', name: 'Transition skating', category: 'On-ice', unit: 's', max: 180, timed: true }
];

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
export const displayNumber = value => number.format(Math.round(value * 100) / 100);
export function measurementChange(current, previous, unit) {
  if (previous === undefined) return 'Baseline only';
  const delta = Math.round((current - previous) * 100) / 100;
  return (delta > 0 ? '+' : '') + displayNumber(delta) + ' ' + unit;
}

// In-browser copy of the prototype's negotiation, for when the site is hosted without the server.
// Same scenario and rules as src/quorum (engine + board) and src/demo/seed; a test checks they agree.
// Each agent answers only "fits", "could stretch" or "no" for each version. Words, limits and
// thresholds never leave an agent.

export const PLAN = Object.freeze({ id: 'club-night', title: 'club night downtown', day: 'fri', start: '22:00', end: '01:00', price: 40, location: 'Fictional downtown club', circleId: 'campus', source: 'demo' });

export const VERSIONS = Object.freeze([
  { id: 'early', title: 'same club, student early entry', activityTags: ['club', 'dance'], day: 'fri', start: '20:30', end: '22:30', price: 12, location: 'Fictional downtown club' },
  { id: 'mic', title: 'open mic night', activityTags: ['music', 'open mic'], day: 'fri', start: '20:00', end: '22:00', price: 5, location: 'Fictional student lounge' },
  { id: 'games', title: 'board game night', activityTags: ['games'], day: 'fri', start: '19:00', end: '22:00', price: 0, location: 'Fictional student union lounge' },
]);

export const ORDER = Object.freeze(['alex', 'maya', 'jay', 'dev']);
export const NAMES = Object.freeze({ alex: 'Alex', maya: 'Maya', jay: 'Jay', dev: 'Dev' });

export const FRIENDS = Object.freeze({
  maya: { says: 'can’t do $40 this week. anything under $15.', terms: { wantsChange: true, conditions: { activityTags: ['any'], maxPrice: 15 }, minOthers: 1 } },
  jay: { says: 'honestly? i’m excited for the club. if it changes, keep it a club thing.', terms: { wantsChange: false, conditions: { activityTags: ['club', 'dance'] } } },
  dev: { says: 'i’d switch if anyone else does. early shift saturday, home by 11.', terms: { wantsChange: true, conditions: { activityTags: ['any'], endsBefore: '23:00' }, minOthers: 1 } },
});

/** Alex's default terms, the same ones the scroll story uses. */
export const DEFAULT_ALEX = Object.freeze({ wantsChange: true, conditions: { activityTags: ['any'], maxPrice: 10, endsBefore: '23:00' }, minOthers: 2 });

export const STRETCH = { pricePct: 0.5, priceMax: 10, minutesMax: 60 };
const minutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

function full(id, input) {
  return { studentId: id, conditions: input.conditions, avoidTags: input.avoidTags ?? [], wantsChange: input.wantsChange, minOthers: Math.max(0, Math.floor(input.minOthers ?? 1)), majorityOnly: !!input.majorityOnly };
}

/** The same checks src/domain/constraints runs, for the limits this demo uses. */
function rejects(c, option) {
  const tags = c.activityTags.includes('any') || !c.activityTags.length ? option.activityTags : c.activityTags;
  if (!tags.some(t => option.activityTags.includes(t))) return 'ACTIVITY_MISMATCH';
  if (c.maxPrice !== undefined && option.price > c.maxPrice) return 'OVER_BUDGET';
  if (c.endsBefore && option.end >= c.endsBefore) return 'ENDS_TOO_LATE';
  return null;
}

export function judge(terms, option, firm = new Set()) {
  if (!terms) return { verdict: 'unknown', stretches: [] };
  if (terms.avoidTags.some(t => option.activityTags.includes(t))) return { verdict: 'no', stretches: [] };
  let c = { ...terms.conditions };
  const stretches = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const why = rejects(c, option);
    if (!why) return { verdict: stretches.length ? 'stretch' : 'fits', stretches };
    if (why === 'OVER_BUDGET' && !firm.has('maxPrice') && c.maxPrice != null) {
      if (option.price - c.maxPrice > STRETCH.priceMax || option.price > c.maxPrice * (1 + STRETCH.pricePct) + 0.001) return { verdict: 'no', stretches: [] };
      stretches.push({ studentId: terms.studentId, field: 'maxPrice', from: c.maxPrice, to: option.price });
      c = { ...c, maxPrice: option.price };
      continue;
    }
    if (why === 'ENDS_TOO_LATE' && !firm.has('endsBefore') && c.endsBefore) {
      if (minutes(option.end) - minutes(c.endsBefore) > STRETCH.minutesMax) return { verdict: 'no', stretches: [] };
      const to = hhmm(minutes(option.end) + 1);
      stretches.push({ studentId: terms.studentId, field: 'endsBefore', from: c.endsBefore, to });
      c = { ...c, endsBefore: to };
      continue;
    }
    return { verdict: 'no', stretches: [] };
  }
  return { verdict: 'no', stretches: [] };
}

export function thresholdHolds(t, wanters, circle) {
  if (wanters - 1 < t.minOthers) return false;
  if (t.majorityOnly && wanters * 2 <= circle) return false;
  return true;
}

export function triggerSize(terms, circle) {
  const wanters = terms.filter(t => t.wantsChange);
  for (let size = wanters.length; size >= 1; size -= 1) {
    const group = [...wanters].sort((a, b) => a.minOthers - b.minOthers).slice(0, size);
    if (group.every(t => thresholdHolds(t, size, circle))) return size;
  }
  return 0;
}

export function shareWords(size, circle = ORDER.length) {
  if (size === circle) return 'all of you';
  if (size * 2 > circle) return 'most of you';
  if (size * 2 === circle) return 'half of you';
  return 'some of you';
}

export function negotiate(termsOf, options, firm = new Map(), trace = []) {
  const ids = ORDER;
  for (const id of ids) trace.push({ step: 'signal', agent: id, ok: !!termsOf.get(id)?.wantsChange });
  const size = triggerSize([...termsOf.values()], ids.length);
  trace.push({ step: 'trigger', ok: size >= 2, groupSize: size });
  if (size < 2) return null;
  let nearMiss = null, fallback = null, fallbackWanters = 0;
  for (const option of options) {
    const judged = ids.map(id => {
      const j = judge(termsOf.get(id), option, firm.get(id));
      trace.push({ step: 'option', option: option.id, agent: id, verdict: j.verdict, ok: j.verdict !== 'no' });
      return { id, ...j };
    });
    const noes = judged.filter(j => j.verdict === 'no');
    const stretches = judged.flatMap(j => j.stretches);
    if (!noes.length && !stretches.length) {
      trace.push({ step: 'result', option: option.id, ok: true, groupSize: ids.length });
      return { option, memberIds: [...ids], stretches: [], everyone: true };
    }
    if (!noes.length && (!nearMiss || stretches.length < nearMiss.stretches.length)) nearMiss = { option, memberIds: [...ids], stretches, everyone: true };
    const fitIds = judged.filter(j => j.verdict === 'fits').map(j => j.id);
    const wantersIn = fitIds.filter(id => termsOf.get(id)?.wantsChange);
    const ok = wantersIn.every(id => thresholdHolds(termsOf.get(id), wantersIn.length, ids.length));
    const better = !fallback || wantersIn.length > fallbackWanters || (wantersIn.length === fallbackWanters && fitIds.length > fallback.memberIds.length);
    if (wantersIn.length >= 2 && ok && better) { fallback = { option, memberIds: fitIds, stretches: [], everyone: false }; fallbackWanters = wantersIn.length; }
  }
  const outcome = nearMiss ?? fallback;
  trace.push({ step: 'result', option: outcome?.option.id, ok: !!outcome, groupSize: outcome?.memberIds.length });
  return outcome;
}

/** Replays the board from Alex's terms and answers. The friends' agents answer by themselves. */
export function tryPlan(alex, actions = []) {
  const termsOf = new Map([...Object.entries(FRIENDS).map(([id, f]) => [id, full(id, f.terms)]), ['alex', full('alex', alex)]]);
  const auto = new Set(['maya', 'jay', 'dev']);
  const firm = new Map();
  const passed = new Set();
  const trace = [];
  let stage = 'idle', outcome = null, stretchAns = new Map(), consents = new Map(), joined = new Set();

  const startConsent = () => { stage = 'consent'; consents = new Map(outcome.memberIds.map(id => [id, 'pending'])); };
  const settle = () => {
    if (stage === 'asking') {
      for (const [id, a] of stretchAns) if (a === 'pending' && auto.has(id)) stretchAns.set(id, 'yes');
      if ([...stretchAns.values()].every(a => a === 'yes')) startConsent();
    }
    if (stage === 'consent') {
      for (const [id, a] of consents) if (a === 'pending' && auto.has(id)) consents.set(id, 'yes');
      if ([...consents.values()].every(a => a === 'yes')) {
        stage = 'announced';
        joined = new Set(outcome.memberIds);
        trace.push({ step: 'result', option: outcome.option.id, ok: true, groupSize: joined.size });
      }
    }
  };
  const run = () => {
    outcome = negotiate(termsOf, VERSIONS.filter(v => !passed.has(v.id)), firm, trace);
    stretchAns = new Map(); consents = new Map();
    if (!outcome) {
      stage = passed.size || firm.size ? 'closed' : 'idle';
      if (stage === 'closed') { outcome = null; firm.clear(); passed.clear(); joined = new Set(); }
      return;
    }
    if (outcome.stretches.length) { stage = 'asking'; for (const s of outcome.stretches) stretchAns.set(s.studentId, 'pending'); }
    else startConsent();
    settle();
  };
  run();

  for (const a of actions.slice(0, 12)) {
    if (a.type === 'stretch' && stage === 'asking' && stretchAns.get('alex') === 'pending') {
      if (a.yes) { stretchAns.set('alex', 'yes'); if ([...stretchAns.values()].every(x => x === 'yes')) startConsent(); settle(); }
      else { const f = firm.get('alex') ?? new Set(); for (const s of outcome.stretches) if (s.studentId === 'alex') f.add(s.field); firm.set('alex', f); run(); }
    } else if (a.type === 'consent' && stage === 'consent' && consents.get('alex') === 'pending') {
      if (a.yes) { consents.set('alex', 'yes'); settle(); }
      else { passed.add(outcome.option.id); run(); }
    } else if (a.type === 'join' && stage === 'announced' && !joined.has('alex')) {
      joined.add('alex');
    }
  }

  const own = termsOf.get('alex');
  const { studentId: _s, ...ownTerms } = own;
  const { ...plan } = PLAN;
  const base = { plan, terms: { ...ownTerms, approved: true }, stage: 'none' };
  let view = base;
  if (!outcome) view = stage === 'closed' ? { ...base, stage: 'closed' } : base;
  else {
    const words = shareWords(outcome.memberIds.length);
    const o = outcome;
    if (stage === 'asking') {
      const mine = o.stretches.find(s => s.studentId === 'alex');
      if (mine && stretchAns.get('alex') === 'pending') { const { studentId: _x, ...stretch } = mine; view = { ...base, stage: 'stretch', option: o.option, stretch, everyone: o.everyone, shareWords: words }; }
    } else if (stage === 'consent' && consents.has('alex')) {
      view = { ...base, stage: consents.get('alex') === 'yes' ? 'waiting' : 'consent', option: o.option, everyone: o.everyone, shareWords: words };
    } else if (stage === 'announced') {
      const ownJoined = joined.has('alex');
      view = { ...base, stage: 'announced', option: o.option, everyone: o.everyone, shareWords: words, ownJoined, ...(ownJoined ? { joined: ORDER.filter(id => joined.has(id)).map(id => NAMES[id]) } : {}) };
    }
  }
  const announcement = stage === 'announced' ? { words: shareWords(outcome.memberIds.length), everyone: outcome.everyone, option: outcome.option } : null;
  return { view, announcement, trace, friends: Object.entries(FRIENDS).map(([id, f]) => ({ id, name: NAMES[id], says: f.says })) };
}

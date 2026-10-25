import { DEFAULT_ALEX, VERSIONS, tryPlan } from './prototype.js?v=5';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

/* ---------- hero: start the scene, type the headline ---------- */
const hero = document.querySelector('.hero');
const start = () => hero.classList.add('is-live');
(document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(start, 120));

const typed = document.querySelector('.typed');
if (typed && !reduceMotion) {
  const words = typed.dataset.words.split('|');
  let index = 0;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = () => document.hidden ? new Promise(r => document.addEventListener('visibilitychange', r, { once: true })) : null;
  (async function loop() {
    await wait(3400);
    for (;;) {
      await visible();
      const current = words[index];
      for (let i = current.length; i >= 0; i -= 1) { typed.textContent = current.slice(0, i); await wait(42); }
      index = (index + 1) % words.length;
      const next = words[index];
      await wait(260);
      for (let i = 1; i <= next.length; i += 1) { typed.textContent = next.slice(0, i); await wait(82); }
      await wait(2600);
    }
  })();
}

/* ---------- nav border once scrolled ---------- */
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- reveal on scroll ---------- */
const revealables = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
  }, { threshold: .14 });
  revealables.forEach(el => io.observe(el));
} else {
  revealables.forEach(el => el.classList.add('in'));
}

/* ---------- how: the stage follows the step in view ---------- */
const stage = document.querySelector('.stage');
const steps = [...document.querySelectorAll('.step')];
const setStep = step => {
  stage.dataset.step = step.dataset.step;
  steps.forEach(s => s.classList.toggle('active', s === step));
};
// The active step is whichever is closest to the reading line, so fast scrolls never skip a state.
let ticking = false;
function pickStep() {
  ticking = false;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const line = window.innerHeight * (narrow ? .7 : .5);
  let best = steps[0], bestDistance = Infinity;
  for (const step of steps) {
    const box = step.getBoundingClientRect();
    const distance = Math.abs(box.top + box.height / 2 - line);
    if (distance < bestDistance) { best = step; bestDistance = distance; }
  }
  if (stage.dataset.step !== best.dataset.step || !best.classList.contains('active')) setStep(best);
}
const queueStep = () => { if (!ticking) { ticking = true; requestAnimationFrame(pickStep); } };
window.addEventListener('scroll', queueStep, { passive: true });
window.addEventListener('resize', queueStep);
pickStep();

/* ---------- try: Alex's side of a negotiation ---------- */
// The server runs the prototype's own engine (and reads free text with the language model). If the
// site is hosted without it, the same rules run here in the browser (prototype.js, tested to match).
const form = document.querySelector('#terms');
const view = document.querySelector('#view');
const ledger = document.querySelector('#ledger');
const phase = document.querySelector('#phase');
const price = document.querySelector('#price');
const priceOut = document.querySelector('#price-out');
const change = document.querySelector('#change');
const othersSet = document.querySelector('#others-set');
const words = document.querySelector('#words');
const say = document.querySelector('#say');
const readBtn = document.querySelector('#read');
const readNote = document.querySelector('#read-note');
const engineLabel = document.querySelector('#engine-label');

let server = false;
let terms = null; // Alex's terms once told to the agent
let actions = [];
let result = null;
let busy = false;
let pendingTimer = null;

const PHASES = {
  idle: 'nothing said yet', none: 'quietly waiting', stretch: 'a private ask', consent: 'a private question',
  waiting: 'waiting on the others', announced: 'the group heard it', closed: 'no version this time',
};
const VERDICT = { fits: 'fits', stretch: 'close', no: 'no', unknown: '?' };
const V_CLASS = { fits: 'yes', stretch: 'maybe', no: 'no', unknown: 'unknown' };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`; };
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} &amp; ${names.at(-1)}`;
const btn = (label, action, { ghost = false, yes = '' } = {}) =>
  `<button type="button" class="pill${ghost ? ' ghost' : ''}" data-action="${action}" data-yes="${yes}">${label}</button>`;
const waitingDots = text => `<p class="waiting"><i></i><i></i><i></i> ${text}</p>`;
const versionLine = o => `<p class="meta">${esc(o.title)} · ${esc(o.day)} ${clock(o.start)}–${clock(o.end)} · ${o.price ? `$${o.price}` : 'free'}</p>`;
const PLAN_LINE = '<p class="meta">club night downtown · fri 10 pm–1 am · $40</p>';
const titleOf = id => VERSIONS.find(v => v.id === id)?.title ?? id;

function readTerms() {
  const home = form.querySelector('input[name="home"]:checked').value;
  const wantsChange = change.checked;
  return {
    wantsChange,
    conditions: { activityTags: ['any'], maxPrice: Number(price.value), ...(home ? { endsBefore: home } : {}) },
    minOthers: wantsChange ? Number(form.querySelector('input[name="others"]:checked').value) : 0,
  };
}

function showTerms(t) {
  change.checked = t.wantsChange;
  const cap = t.conditions.maxPrice;
  price.value = cap == null ? 20 : Math.min(20, cap);
  priceOut.textContent = cap == null ? 'no cap' : `$${cap}`;
  const home = t.conditions.endsBefore ?? '';
  const radio = form.querySelector(`input[name="home"][value="${home}"]`);
  if (radio) radio.checked = true;
  const others = form.querySelector(`input[name="others"][value="${Math.min(3, Math.max(1, t.minOthers ?? 1))}"]`);
  if (others) others.checked = true;
  othersSet.disabled = !t.wantsChange;
}

async function compute() {
  if (server) {
    try {
      const r = await fetch('/api/try', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ terms, actions }) });
      if (r.ok) return (await r.json()).result;
    } catch { /* fall through to the browser copy */ }
  }
  return tryPlan(terms, actions);
}

async function refresh() {
  if (!terms) { result = null; render(); return; }
  busy = true;
  result = await compute();
  busy = false;
  render();
}

function renderView() {
  const v = result?.view;
  const stage = !v ? 'idle' : v.stage;
  phase.textContent = PHASES[stage];
  const ask = v?.stretch && (v.stretch.field === 'maxPrice'
    ? `<b>$${v.stretch.to} instead of $${v.stretch.from}</b>`
    : `<b>staying till ${clock(v.option.end)}</b> instead of being home by ${clock(v.stretch.from)}`);
  const group = v?.everyone ? 'your whole group' : `${esc(v?.shareWords ?? '')}`;
  switch (stage) {
    case 'idle':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( ? )</span><h3>the club night is the plan.</h3>${PLAN_LINE}
        <p>Everyone typed “sounds fun lol.” Tell your agent how you really feel. Nothing is shared unless a version works.</p></div>`;
      break;
    case 'none':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( · )</span><h3>quietly waiting.</h3>
        <p>${terms.wantsChange ? 'Not enough of you want a change on your terms yet, so nothing moves. Nobody knows you said anything.' : 'You’re happy with the plan. Your agent only speaks up if the others find a version that fits you too.'}</p></div>`;
      break;
    case 'stretch':
      view.innerHTML = `<div class="card"><p class="micro tag">just you &amp; your agent</p><h3>✳ one small ask, just for you.</h3>
        <p>Your friends’ agents found a version that works for ${group}:</p>${versionLine(v.option)}
        <p>It works if you can do ${ask}. Ok? Nobody will know it was you.</p>
        <div class="actions">${btn('yes, i can <span aria-hidden="true">↗</span>', 'stretch', { yes: '1' })}${btn('no, keep my limit', 'stretch', { ghost: true, yes: '0' })}</div></div>`;
      break;
    case 'consent':
      view.innerHTML = `<div class="card"><p class="micro tag">same question everyone gets</p><h3>✳ a version ${v.everyone ? 'all of you' : esc(v.shareWords)} can do.</h3>
        ${versionLine(v.option)}
        <p>${v.everyone ? 'Would you switch to it? Nobody learns who wanted a change, or anyone’s limits.' : 'No version fits everyone, but this one fits you. The club night still stands for anyone who wants it. Switch?'}</p>
        <div class="actions">${btn('yes, switch <span aria-hidden="true">↗</span>', 'consent', { yes: '1' })}${btn('pass', 'consent', { ghost: true, yes: '0' })}</div></div>`;
      break;
    case 'waiting':
      view.innerHTML = `<div class="card"><h3>counted.</h3>${versionLine(v.option)}${waitingDots('waiting on the others’ private answers')}</div>`;
      break;
    case 'announced': {
      const post = result.announcement.everyone
        ? `<div class="group-post"><span class="micro">posted in the group channel</span><p>✳ new version of the plan: all of you are down.</p>${versionLine(result.announcement.option)}<p class="micro">no names · no reasons · nobody went first</p></div>`
        : `<div class="group-post"><span class="micro">posted in the group channel</span><p>✳ ${esc(result.announcement.words)} are doing something else this time.</p>${versionLine(result.announcement.option)}<p class="micro">the club night still stands · anyone can join</p></div>`;
      view.innerHTML = v.ownJoined
        ? `<div class="state"><span class="signal" aria-hidden="true">✳</span><h3>it’s on.</h3>${versionLine(v.option)}<p>You’re in with ${list(v.joined)}.</p></div>${post}`
        : `<div class="card"><h3>✳ a new version in your group.</h3><p>It didn’t fit your terms, so you weren’t asked. Joining is your call.</p>${versionLine(v.option)}
            <div class="actions">${btn('i’m in <span aria-hidden="true">↗</span>', 'join')}</div></div>${post}`;
      break;
    }
    case 'closed':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( · )</span><h3>no version worked this time.</h3>
        <p>The club night stands, and nobody learns why. Your terms stay private.</p>
        <div class="actions">${btn('start over', 'reset', { ghost: true })}</div></div>`;
      break;
  }
}

function renderLedger() {
  if (!result) {
    ledger.innerHTML = '<p class="ledger-empty">nothing has crossed yet. agents stay quiet until their student speaks up.</p>';
    return;
  }
  // Each run of the agents starts with the "would you like a change?" round.
  const runs = [];
  for (const row of result.trace) {
    if (row.step === 'signal' && (!runs.length || runs.at(-1).some(r => r.step !== 'signal'))) runs.push([]);
    if (!runs.length) runs.push([]);
    runs.at(-1).push(row);
  }
  const html = runs.map((rows, i) => {
    const parts = [];
    const signals = rows.filter(r => r.step === 'signal');
    if (signals.length) parts.push(`<div class="round"><p class="round-title">${runs.length > 1 ? `round ${i + 1} · ` : ''}would your student like a change?</p><div class="round-row">${signals.map(t => `<span class="v ${t.ok ? 'yes' : ''}">${t.agent} ${t.ok ? 'yes' : 'no'}</span>`).join('')}</div></div>`);
    const trigger = rows.find(r => r.step === 'trigger');
    if (trigger && !trigger.ok) parts.push('<div class="round"><p class="kept">not enough of you want a change for everyone’s safety net. nothing happens, nobody is told.</p></div>');
    const options = [...new Set(rows.filter(r => r.step === 'option').map(r => r.option))];
    for (const id of options) {
      const vs = rows.filter(r => r.step === 'option' && r.option === id);
      parts.push(`<div class="round"><p class="round-title">${esc(titleOf(id))}</p><div class="round-row">${vs.map(t => `<span class="v ${V_CLASS[t.verdict]}">${t.agent} ${VERDICT[t.verdict]}</span>`).join('')}</div></div>`);
    }
    const res = rows.filter(r => r.step === 'result').at(-1);
    if (res && trigger?.ok) parts.push(`<div class="round"><p class="kept">${res.ok ? `<b>${esc(titleOf(res.option))}</b> for ${res.groupSize === 4 ? 'everyone' : `${res.groupSize} of 4`}` : 'no version works. it closes quietly.'}</p></div>`);
    return parts.join('');
  }).join('');
  ledger.innerHTML = html + '<p class="kept">words, budgets, curfews and thresholds never left any agent.</p>';
}

function render() { renderView(); renderLedger(); }

async function act(action) {
  if (busy) return;
  clearTimeout(pendingTimer);
  actions.push(action);
  // A short pause so the moment of waiting on the others is visible.
  if (action.type === 'consent' && action.yes) {
    phase.textContent = PHASES.waiting;
    view.innerHTML = `<div class="card"><h3>counted.</h3>${versionLine(result.view.option)}${waitingDots('waiting on the others’ private answers')}</div>`;
    pendingTimer = setTimeout(refresh, reduceMotion ? 0 : 1300);
    return;
  }
  await refresh();
}

function startOver() {
  clearTimeout(pendingTimer);
  terms = null; actions = []; result = null;
  showTerms(DEFAULT_ALEX);
  readNote.textContent = '';
  render();
}

price.addEventListener('input', () => { priceOut.textContent = `$${price.value}`; });
change.addEventListener('change', () => { othersSet.disabled = !change.checked; });
form.addEventListener('change', event => {
  if (event.target === say) return;
  // New terms mean a new negotiation: old questions and answers are dropped.
  if (terms) { clearTimeout(pendingTimer); terms = null; actions = []; result = null; render(); }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  terms = readTerms();
  actions = [];
  await refresh();
  view.tabIndex = -1;
  view.focus({ preventScroll: true });
});
document.querySelector('#start-over').addEventListener('click', startOver);
view.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, yes } = control.dataset;
  if (action === 'reset') { startOver(); return; }
  act(action === 'join' ? { type: 'join' } : { type: action, yes: yes === '1' });
  view.tabIndex = -1;
  view.focus({ preventScroll: true });
});

readBtn.addEventListener('click', async () => {
  const text = say.value.trim();
  if (!text || busy) return;
  readBtn.disabled = true;
  readNote.textContent = 'your agent is reading it…';
  try {
    const r = await fetch('/api/try', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const body = await r.json();
    if (!r.ok) { readNote.textContent = body.error ?? 'that didn’t work. try the controls below.'; return; }
    if (body.clarify) { readNote.textContent = `your agent asks: ${body.clarify}`; return; }
    clearTimeout(pendingTimer);
    showTerms(body.terms);
    terms = body.terms; actions = []; result = body.result;
    readNote.textContent = body.source === 'model' ? 'read by the language model. check the controls below: that’s exactly what your agent will use.' : 'read with simple rules (the model was unavailable). check the controls below.';
    render();
  } catch {
    readNote.textContent = 'couldn’t reach your agent. the controls below still work.';
  } finally {
    readBtn.disabled = false;
  }
});

// Is the prototype's server here? Then use its engine, and offer free-text reading.
(async () => {
  try {
    const r = await fetch('/api/try', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ terms: DEFAULT_ALEX, actions: [] }) });
    if (r.ok && (await r.json()).result) {
      server = true;
      words.hidden = false;
      engineLabel.textContent = 'running on our server · same engine as the discord bot · fictional friends';
      return;
    }
  } catch { /* static hosting */ }
  engineLabel.textContent = 'runs in your browser · same rules as our prototype · fictional friends';
})();

showTerms(DEFAULT_ALEX);
render();

/* ---------- discord invite: only clickable once a real link is set ---------- */
const invite = document.querySelector('#discord-invite');
if (invite) {
  const url = invite.dataset.invite;
  if (/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(url)) {
    Object.assign(invite, { href: url, target: '_blank', rel: 'noopener' });
  } else {
    invite.removeAttribute('href');
    invite.setAttribute('aria-disabled', 'true');
    invite.classList.add('pill-off');
    invite.innerHTML = 'invite link coming soon';
  }
}

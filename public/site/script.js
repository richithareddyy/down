
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
  }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
  revealables.forEach(el => io.observe(el));
} else {
  revealables.forEach(el => el.classList.add('in'));
}
// Jumping to a section (nav links, #try in the address bar) shows it right away, not after a fade.
const showSection = hash => {
  const target = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
  if (!target) return;
  target.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('in'));
  if (target.matches('[data-reveal]')) target.classList.add('in');
};
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link) showSection(link.getAttribute('href'));
});
window.addEventListener('hashchange', () => showSection(location.hash));
showSection(location.hash);

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

/* ---------- try: Alex looking for a game ---------- */
// Every answer comes from the prototype's engine on our server (and the language model reads free text).
const form = document.querySelector('#terms');
const view = document.querySelector('#view');
const ledger = document.querySelector('#ledger');
const phase = document.querySelector('#phase');
const alone = document.querySelector('#alone');
const words = document.querySelector('#words');
const say = document.querySelector('#say');
const readBtn = document.querySelector('#read');
const readNote = document.querySelector('#read-note');
const engineLabel = document.querySelector('#engine-label');

const DEFAULT = { kinds: ['basketball'], freeFrom: '13:30', freeUntil: '14:30', level: 'new', notAlone: true };
let terms = null;
let actions = [];
let result = null;
let busy = false;
let timer = null;

const PHASES = { idle: 'nothing said yet', none: 'quietly looking', confirm: 'a seat is ready', waiting: 'waiting on the others', seated: 'you’re in', closed: 'no arrangement' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`; };
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} &amp; ${names.at(-1)}`;
const btn = (label, action, { ghost = false, yes = '' } = {}) => `<button type="button" class="pill${ghost ? ' ghost' : ''}" data-action="${action}" data-yes="${yes}">${label}</button>`;
const dots = text => `<p class="waiting"><i></i><i></i><i></i> ${text}</p>`;
const versionLine = v => `<p class="meta">${esc(v.label)} · ${clock(v.start)}–${clock(v.end)} · court 2</p>`;

function readTerms() {
  return {
    kinds: ['basketball'],
    freeFrom: '13:30',
    freeUntil: form.querySelector('input[name="until"]:checked').value,
    level: form.querySelector('input[name="level"]').value,
    notAlone: alone.checked,
  };
}
function readOptions() {
  const others = ['riley'];
  if (form.querySelector('#w-jordan').checked) others.unshift('jordan');
  if (form.querySelector('#w-priya').checked) others.splice(others.length - 1, 0, 'priya');
  return { others, daveSubs: form.querySelector('#w-dave').checked };
}
function showTerms(t) {
  alone.checked = !!t.notAlone;
  form.querySelector('input[name="level"]').value = t.level;
  const nearest = ['14:20', '14:30', '15:00'].reduce((best, x) => Math.abs(toMin(x) - toMin(t.freeUntil)) < Math.abs(toMin(best) - toMin(t.freeUntil)) ? x : best, '14:30');
  form.querySelector(`input[name="until"][value="${nearest}"]`).checked = true;
}
const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

async function post(body) {
  const r = await fetch('/api/try', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || 'the demo server didn’t answer');
  return json;
}

async function refresh() {
  if (!terms) { result = null; render(); return; }
  busy = true;
  try { result = (await post({ terms, options: readOptions(), actions })).result; }
  catch (e) { result = null; view.innerHTML = `<div class="state"><h3>couldn’t reach the agents.</h3><p>${esc(e.message)}. try again in a moment.</p></div>`; busy = false; return; }
  busy = false;
  render();
}

function renderView() {
  const v = result?.view;
  const stage = !v ? 'idle' : v.stage;
  phase.textContent = PHASES[stage] ?? '';
  const r = v?.rotation;
  switch (stage) {
    case 'idle':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( ? )</span><h3>court 2 is playing 3v3.</h3><p class="meta">sun devil fitness complex · 1:30 pm · beginners fine</p>
        <p>They’d go 4v4 if exactly two more joined. Tell your agent your terms. You’ll only hear back when there’s a complete seat for you.</p></div>`;
      break;
    case 'none':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( · )</span><h3>quietly looking.</h3>
        <p>No arrangement fits your terms yet. Nobody saw your request, and you won’t get counteroffers or failed searches.</p></div>
        <p class="hint">try a what-if: let jordan or priya look too.</p>`;
      break;
    case 'confirm':
      view.innerHTML = `<div class="card"><p class="micro tag">one complete seat</p><h3>✳ a seat is open for you.</h3>
        ${versionLine(v.version)}
        <p>${v.newcomers ? `You won’t be the only new one: ${v.newcomers} other newcomer${v.newcomers === 1 ? '' : 's'} join${v.newcomers === 1 ? 's' : ''} with you.` : 'You’re the newcomer the game needs.'}${r ? (r.you ? ` You can leave at ${clock(r.at)}: a sub rotates in for you.` : ` One newcomer leaves at ${clock(r.at)} and a sub rotates in.`) : ''}</p>
        <p class="hint">names and the court unlock when everyone confirms.</p>
        <div class="actions">${btn('take my seat <span aria-hidden="true">↗</span>', 'confirm', { yes: '1' })}${btn('pass', 'confirm', { ghost: true, yes: '0' })}</div></div>`;
      break;
    case 'waiting':
      view.innerHTML = `<div class="card"><h3>confirmed.</h3>${versionLine(v.version)}${dots('waiting on the others')}</div>`;
      break;
    case 'seated': {
      const a = result.announcement;
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">✳</span><h3>you’re in.</h3>${versionLine(v.version)}<p>With ${list(v.names)}.${r ? ` Rotation at ${clock(r.at)}.` : ''}</p></div>
        <div class="group-post"><span class="micro">posted in the group channel</span><p>✳ open seat filled: 3v3 half court → ${esc(a.version.label)} from ${clock(a.version.start)}.</p><p class="micro">${a.newcomers} newcomers · nobody had to walk up and ask</p></div>`;
      break;
    }
    case 'closed':
      view.innerHTML = `<div class="state"><span class="signal" aria-hidden="true">( · )</span><h3>no arrangement this time.</h3><p>Nobody was named, and nobody learns why. Your terms stay private.</p>
        <div class="actions">${btn('start over', 'reset', { ghost: true })}</div></div>`;
      break;
  }
}

function renderLedger() {
  if (!result) { ledger.innerHTML = '<p class="ledger-empty">nothing has crossed yet. agents stay quiet until their student speaks up.</p>'; return; }
  ledger.innerHTML = result.log.map(row => `<p class="row${row.ok ? '' : ' miss'}"><span class="lvl l${row.level}">L${row.level}</span><span class="who">${esc(row.from)} → ${esc(row.to)}</span>: ${esc(row.text)}</p>`).join('')
    + '<p class="kept">never sent: anyone’s words, level, or reason for leaving.</p>';
}

function render() { renderView(); renderLedger(); }

async function act(action) {
  if (busy) return;
  clearTimeout(timer);
  actions.push(action);
  if (action.yes) {
    phase.textContent = PHASES.waiting;
    view.innerHTML = `<div class="card"><h3>confirmed.</h3>${versionLine(result.view.version)}${dots('waiting on the others')}</div>`;
    timer = setTimeout(refresh, reduceMotion ? 0 : 1200);
    return;
  }
  await refresh();
}

function startOver() {
  clearTimeout(timer);
  terms = null; actions = []; result = null;
  form.reset();
  readNote.textContent = '';
  render();
}

form.addEventListener('change', event => {
  if (event.target === say) return;
  // New terms or a new what-if mean a fresh negotiation.
  if (terms) { clearTimeout(timer); terms = readTerms(); actions = []; refresh(); }
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
  if (control.dataset.action === 'reset') { startOver(); return; }
  act({ type: 'confirm', yes: control.dataset.yes === '1' });
});

readBtn.addEventListener('click', async () => {
  const text = say.value.trim();
  if (!text || busy) return;
  readBtn.disabled = true;
  readNote.textContent = 'your agent is reading it…';
  try {
    const body = await post({ text, options: readOptions() });
    if (body.clarify) { readNote.textContent = `your agent asks: ${body.clarify}`; return; }
    showTerms(body.terms);
    terms = body.terms; actions = []; result = body.result;
    readNote.textContent = body.source === 'model' ? 'read by the language model. the controls below now show exactly what your agent will use.' : 'read with simple rules (the model was unavailable). check the controls below.';
    render();
  } catch (e) {
    readNote.textContent = `couldn’t reach your agent: ${e.message}.`;
  } finally {
    readBtn.disabled = false;
  }
});

// Is the prototype's server here? Then offer free-text reading too.
(async () => {
  try {
    await post({ terms: DEFAULT, actions: [] });
    words.hidden = false;
    engineLabel.textContent = 'running on our server · same engine as the discord bot · fictional students';
  } catch {
    engineLabel.textContent = 'the live demo needs our server. open this page from the deployed site.';
  }
})();

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

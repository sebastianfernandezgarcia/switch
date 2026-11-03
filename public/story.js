import { storyContext, openRehearsal } from './app.js';
import { translate, localize, getLanguage, modelText } from './i18n.mjs';

const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let context = storyContext();
const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let stage = 0, framePending = false;
let theme = 'light';
try { theme = localStorage.getItem('switch-theme') === 'dark' ? 'dark' : 'light'; } catch {}
function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.innerHTML = '<span class="theme-caption">' + (value === 'light' ? 'Oscuro' : 'Claro') + '</span> <span aria-hidden="true">◐</span>';
    button.setAttribute('aria-label', 'Activar modo ' + (value === 'light' ? 'oscuro' : 'claro'));
    button.setAttribute('aria-pressed', String(value === 'dark'));
  });
  localize(document);
}
applyTheme(theme);
document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light'; applyTheme(theme);
  try { localStorage.setItem('switch-theme', theme); } catch {}
}));

function showStage(index) {
  stage = index;
  $('scroll-scene').dataset.stage = String(index);
  $('story-stage-number').textContent = '0' + (index + 1);
  $('story-stage-label').textContent = translate(['Última posición recibida', 'Dos avisos que discrepan', 'Contrastar con las fuentes', 'Dos respuestas para ensayar'][index]);
  document.querySelectorAll('.story-beat').forEach((el, i) => el.classList.toggle('is-current', i === index));
}

function drawContext() {
  context = storyContext();
  if (!context) {
    $('recorded-question').textContent = 'La lectura real guardada no está disponible. Puedes volver a cargar el laboratorio.';
    $('recorded-proof').textContent = 'No se ha generado una respuesta de sustitución.';
    document.querySelectorAll('[data-rehearse]').forEach(b => b.disabled = true);
    return;
  }
  const station = id => context.stations.find(p => p.id === id);
  $('story-tracks').innerHTML = context.edges.map(e => {
    const a = station(e.from), b = station(e.to);
    return '<path class="story-edge story-' + e.id + '" d="M' + a.x + ' ' + a.y + 'L' + b.x + ' ' + b.y + '"/>';
  }).join('');
  $('story-stations').innerHTML = context.stations.map(s => '<g><circle cx="' + s.x + '" cy="' + s.y + '" r="7"/><text x="' + s.x + '" y="' + (s.y + 40) + '" text-anchor="middle">' + safe(s.name) + '</text></g>').join('');
  $('story-trains').innerHTML = context.scenario.trains.map(t => {
    const a = station(t.station ?? t.from), b = station(t.to);
    const x = t.station ? a.x : a.x + (b.x - a.x) * t.progress;
    const y = t.station ? a.y : a.y + (b.y - a.y) * t.progress;
    const color = t.edge ? 'var(--red)' : 'var(--plum)';
    return '<g><rect x="' + (x - 28) + '" y="' + (y - 12) + '" width="56" height="24" rx="12" fill="var(--paper)" stroke="' + color + '" stroke-width="3"/><path d="M' + (x - 17) + ' ' + y + 'H' + (x + 13) + '" stroke="' + color + '" stroke-width="7"/><text class="story-train-label' + (t.edge ? ' story-train-pending' : '') + '" x="' + x + '" y="' + (y - 30) + '" text-anchor="middle">' + t.id + '</text></g>';
  }).join('');
  $('story-source-log').innerHTML = context.scenario.sources.map(s => '<div class="source-line" data-source="' + s.id + '"><span>' + s.at + ' / ' + s.id + '</span><p>' + safe(s.text) + '</p></div>').join('');
  const reading = context.agent ?? context.reading;
  const cited = new Set(reading?.proposal.evidence.map(s => s.sourceId) ?? []);
  $('story-source-log').querySelectorAll('[data-source]').forEach(el => el.classList.toggle('is-cited', cited.has(el.dataset.source)));
  $('recorded-question').textContent = reading ? modelText(reading, reading.proposal.question ? 'question' : 'nextQuestion') : 'La lectura de Meta no está disponible para este caso.';
  $('recorded-proof').textContent = reading ? 'Muse Spark Open · lectura real guardada · ' + (reading.elapsedMs / 1000).toFixed(1) + ' s · ' + reading.proposal.evidence.map(s => s.sourceId).join(' + ') : 'Sin lectura de IA; no se muestra una respuesta simulada.';
  $('wait-delay').textContent = context.comparison[0].metrics.totalDelay;
  $('bypass-delay').textContent = context.comparison[1].metrics.totalDelay;
  localize($('scroll-scene'));
}

function sizeDiagram() {
  const compact = matchMedia('(max-width:760px)').matches;
  const diagram = document.querySelector('.story-network');
  diagram.setAttribute('viewBox', compact ? '330 100 600 390' : '30 70 1180 460');
  document.querySelector('.visual-footnote').textContent = compact ? 'Vista parcial del ejercicio. El dibujo conserva la última posición recibida.' : 'Esquema y tiempos ficticios. La posición dibujada es el último dato del ejercicio.';
  localize(document.querySelector('.visual-footnote'));
}
drawContext(); sizeDiagram(); showStage(0); document.body.classList.add('story-enhanced');
const beats = [...document.querySelectorAll('.story-beat')];
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) showStage(Number(entry.target.dataset.beat));
}, { rootMargin: '-28% 0px -40% 0px', threshold: 0 });
beats.forEach(el => observer.observe(el));

const labObserver = new IntersectionObserver(entries => {
  const active = entries[0].isIntersecting;
  document.body.classList.toggle('lab-active', active);
  $('story-nav').inert = active;
}, { rootMargin: '-10% 0px -35% 0px', threshold: 0 });
labObserver.observe($('lab'));

function progress() {
  framePending = false;
  const rect = $('scroll-scene').getBoundingClientRect();
  const amount = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - innerHeight)));
  document.documentElement.style.setProperty('--chapter-progress', amount.toFixed(4));
  const onLight = ['origin', 'your-turn'].some(id => {
    const bounds = $(id).getBoundingClientRect();
    return bounds.top <= 65 && bounds.bottom > 65;
  });
  document.body.classList.toggle('nav-light', onLight);
  if (motion) {
    const hero = $('start').getBoundingClientRect();
    document.documentElement.style.setProperty('--hero-shift', Math.max(0, Math.min(80, -hero.top * .15)) + 'px');
  }
}
addEventListener('scroll', () => { if (!framePending) { framePending = true; requestAnimationFrame(progress); } }, { passive: true });
addEventListener('resize', () => { sizeDiagram(); progress(); }); progress();

let opening = false;
document.querySelectorAll('[data-rehearse]').forEach(button => button.addEventListener('click', async () => {
  if (opening) return;
  opening = true;
  const content = [...button.childNodes];
  document.querySelectorAll('[data-rehearse]').forEach(b => b.disabled = true);
  button.textContent = 'Abriendo el ensayo…';
  try {
    const result = await openRehearsal(button.dataset.case ?? 'corridor-north-01', button.dataset.rehearse || undefined);
    $('entry-status').textContent = result ? 'Ensayo abierto. Se conserva en tu historial.' : 'No se pudo abrir el ensayo. El estado anterior se conserva; prueba desde el laboratorio.';
    localize($('entry-status'));
  } catch {
    $('entry-status').textContent = 'No se pudo abrir el ensayo. Vuelve a intentarlo desde el laboratorio.';
    localize($('entry-status'));
  } finally {
    button.replaceChildren(...content);
    document.querySelectorAll('[data-rehearse]').forEach(b => b.disabled = false);
    opening = false;
  }
}));

document.addEventListener('visibilitychange', () => { if (document.hidden) observer.takeRecords(); });
document.addEventListener('switch:language',()=>{applyTheme(theme);drawContext();showStage(stage);sizeDiagram();localize(document);});
document.addEventListener('switch:state',()=>{drawContext();});

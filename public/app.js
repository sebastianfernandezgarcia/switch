import { translate, localize, getLanguage, modelText } from './i18n.mjs';
import { createRailScene } from './scene3d.js';
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let data, comparing = false, focused = false, busy = false, minute = 0, playing = false;
let analysisId = null, animationId = null, lastFrame = null, metaTimer = null, notificationTimer, remotePoll;
let spatial, heroSpatial, view3d = true, previousVisible = false, lastSceneFocus;

async function request(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.message ?? 'No se pudo completar la acción.'); error.code = result.error; throw error; }
  return result;
}
function notify(text, error = false) {
  clearTimeout(notificationTimer);
  $('notice').textContent = text;
  $('notice').className = 'notice' + (error ? ' error' : '');
  $('notice').hidden = false;
  localize($('notice'));
  if (!error) notificationTimer = setTimeout(() => { $('notice').hidden = true; }, 5500);
}
function branch() { return data?.session.branches.find(b => b.id === data.session.activeBranchId); }
function analysis() {
  const selected = branch();
  if (data?.branchStatus.find(b => b.id === selected?.id)?.stale) return data.analysis;
  return selected ? data.session.analyses.findLast(a => a.scenarioHash === selected.scenarioHash) : data.analysis;
}
function pause() {
  playing = false; lastFrame = null; cancelAnimationFrame(animationId); animationId = null;
  $('play-button').setAttribute('aria-label', translate('Reproducir rama'));
  $('play-button').innerHTML = '<span aria-hidden="true">▶</span>';
  $('world-play').textContent = translate('Reproducir');
}
async function action(actionName, extra = {}, options = {}) {
  if (busy || data.busy) return false;
  pause();
  try {
    data = await request('/api/action', { revision: data.session.revision, action: actionName, ...extra });
    $('rejection').hidden = true;
    minute = 0;
    if (actionName === 'rewind' || actionName === 'select_scenario') { comparing = false; focused = false; analysisId = null; $('rejection').hidden = true; }
    if (actionName === 'incident') focused = true;
    if (actionName === 'receive_notice') { comparing = true; focused = matchMedia('(max-width:760px)').matches; notify('S4 ha llegado. R5 queda cerrado; el ensayo anterior se conserva con su evidencia original.'); }
    if (actionName === 'branch') { comparing = false; if (options.scroll !== false) $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    render();
    if (actionName === 'receive_notice') $('lab').scrollIntoView({ behavior: 'instant', block: 'start' });
    return true;
  } catch (error) {
    if (error.code === 'CLEARANCE_NOT_CONFIRMED') {
      $('rejection').textContent = 'Ensayo rechazado. ' + error.message;
      $('rejection').hidden = false;
    } else notify(error.message, true);
    if (error.code === 'REVISION_CONFLICT') { data = await request('/api/state'); render(); }
    return false;
  }
}
function clock(t) {
  const [h, m] = (data?.playbackScenario?.startTime ?? data?.scenario.startTime ?? '08:17').split(':').map(Number);
  const total = h * 60 + m + Math.floor(t);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function timer(t) {
  return '+' + String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.floor((t % 1) * 60)).padStart(2, '0');
}
function point(id) { return data.stations.find(s => s.id === id); }
function trainPosition(train, selected) {
  if (!selected) {
    if (train.station) return { ...point(train.station), angle: 0, pending: false, parked: true };
    const a = point(train.from), b = point(train.to);
    return { x: a.x + (b.x - a.x) * train.progress, y: a.y + (b.y - a.y) * train.progress, angle: 0, pending: data.session.incident };
  }
  const legs = selected.simulation.legs.filter(l => l.train === train.id).sort((a, b) => a.start - b.start);
  let current = null;
  for (const leg of legs) if (minute >= Math.max(0, leg.start) && minute < leg.end) { current = leg; break; }
  if (!current) {
    const finished = legs.filter(l => minute >= l.end).at(-1);
    return { ...point(finished?.to ?? train.station ?? train.from), angle: 0, pending: false, parked: true };
  }
  const a = point(current.from), b = point(current.to);
  let progress = Math.max(0, Math.min(1, (minute - current.start) / (current.end - current.start)));
  if (current.initialProgress !== undefined) progress = current.initialProgress + (1 - current.initialProgress) * Math.min(1, minute / current.end);
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress,
    angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, pending: train.id === 'T07' && minute < selected.parameters.clearanceMinutes };
}
function renderNetwork() {
  if (!data) return;
  const selected = branch();
  const historical = data.branchStatus.find(b => b.id === selected?.id)?.stale;
  const scene = historical ? data.playbackScenario : data.scenario;
  const conditions = historical ? selected.parameters : data.session.parameters;
  const used = new Set(selected?.simulation.legs.filter(l => l.train !== 'T07').map(l => l.edge) ?? []);
  const edgeStates = data.edges.map(edge => ({ id: edge.id, active: used.has(edge.id),
    unknown: data.session.incident && !scene.confirmed && edge.id === 'R2' && (!selected || minute < selected.parameters.clearanceMinutes),
    closed: data.session.incident && edge.id === 'R5' && !conditions.bypassOpen }));
  $('exercise-network').setAttribute('viewBox', focused ? '240 90 780 500' : '0 70 1240 500');
  $('edges').innerHTML = data.edges.map(edge => {
    const a = point(edge.from), b = point(edge.to);
    const unknown = data.session.incident && !scene.confirmed && edge.id === 'R2' && (!selected || minute < selected.parameters.clearanceMinutes);
    const closed = data.session.incident && edge.id === 'R5' && !conditions.bypassOpen;
    return '<path class="edge' + (used.has(edge.id) ? ' active' : '') + (unknown ? ' unknown' : '') + (closed ? ' closed' : '') + '" d="M' + a.x + ' ' + a.y + 'L' + b.x + ' ' + b.y + '"/>';
  }).join('');
  $('edge-labels').innerHTML = data.edges.map(edge => {
    const a = point(edge.from), b = point(edge.to);
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 + (edge.id === 'R2' ? 65 : 28);
    const label = edge.id === 'R2' && data.session.incident ? 'R2 · ' + (scene.confirmed ? 'confirmado en el ejercicio' : selected && minute >= selected.parameters.clearanceMinutes ? 'confirmación asumida en esta rama' : 'sin confirmación') : edge.id === 'R5' && data.session.incident && !conditions.bypassOpen ? 'R5 / cerrado' : edge.id + ' / ' + edge.minutes + ' min';
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" class="' + (edge.id === 'R2' && data.session.incident ? 'edge-source' : 'edge-label') + '">' + escapeHtml(label) + '</text>';
  }).join('');
  $('stations').innerHTML = data.stations.map(s => '<g><circle class="station-circle" cx="' + s.x + '" cy="' + s.y + '" r="8"/><text class="station-label" x="' + s.x + '" y="' + (s.y + (s.id === 'E' ? 42 : 52)) + '" text-anchor="middle">' + s.name + '</text></g>').join('');
  const positions = scene.trains.map(train => ({ train, point: trainPosition(train, selected) }));
  const placed = positions.map(({ train, point: original }) => {
    const p = { ...original };
    const parkedHere = positions.filter(other => other.point.parked && other.point.x === original.x && other.point.y === original.y);
    if (original.parked && parkedHere.length > 1) p.x += (parkedHere.findIndex(other => other.train.id === train.id) - (parkedHere.length - 1) / 2) * 76;
    return { train, point: p };
  });
  $('train-positions').innerHTML = placed.map(({ train, point: p }) => {
    return '<g class="' + (p.pending ? 'train-pending' : selected ? 'train-active' : '') + '"><g transform="translate(' + p.x + ' ' + p.y + ') rotate(' + p.angle + ')" filter="url(#train-shadow)"><rect class="train-body" x="-29" y="-10" width="58" height="20" rx="10"/><rect class="train-window" x="-20" y="-5" width="28" height="10" rx="3"/><path d="M15 -5L23 0L15 5Z" class="train-window"/></g><text class="train-label" x="' + p.x + '" y="' + (p.y - 25) + '" text-anchor="middle">' + train.id + (p.pending ? ' · último dato' : '') + '</text></g>';
  }).join('');
  $('uncertainty-zone').setAttribute('opacity', data.session.incident && !scene.confirmed && (!selected || minute < selected.parameters.clearanceMinutes) ? '1' : '0');
  $('movement-caption').hidden = !selected;
  if (selected) {
    const event = selected.simulation.events.filter(e => e.minute <= minute).at(-1);
    $('movement-caption').textContent = event?.text ?? 'Inicio del ensayo';
  }
  $('scene-clock').textContent = clock(minute);
  $('timeline-start').textContent = clock(0);
  $('elapsed').textContent = timer(minute);
  $('timeline').value = String(minute);
  $('world-time').value = String(minute); $('world-time').max = String(selected?.simulation.metrics.duration ?? 12);
  $('world-time').disabled = !selected;
  $('world-elapsed').textContent = timer(minute);
  $('world-play').disabled = busy || !!data.busy || (!selected && !data.agent);
  $('world-play').textContent = translate(!selected && data.agent ? 'Ensayar propuesta' : playing ? 'Pausar' : 'Reproducir');
  const previousBranch = data.scenario.id === 'corridor-update-04' ? data.session.branches.findLast(b => (b.scenarioId ?? 'corridor-north-01') === 'corridor-north-01' && b.strategy === 'bypass') : null;
  $('previous-plan').hidden = !previousBranch;
  $('previous-plan-caption').hidden = !previousVisible || !previousBranch;
  if (spatial) {
    spatial.setState({ stations: data.stations, edges: data.edges, positions: placed, edgeStates, version: scene.version,
      evidenceHash: historical ? selected.scenarioHash : data.evidenceHash, minute, previousBranch,
      pendingLabel: getLanguage() === 'en' ? ' · last reported' : ' · último dato' });
    if (lastSceneFocus !== focused) { spatial.setPose(focused ? 'R2' : 'overview'); lastSceneFocus = focused; }
  }
  localize($('exercise-network')); localize($('movement-caption'));
  document.dispatchEvent(new CustomEvent('switch:clock',{detail:{minute}}));
}
function renderPlans() {
  const selected = branch(), report = data.analysis;
  $('plans').innerHTML = data.comparison.map(result => {
    const selectedSame = selected?.strategy === result.strategy && JSON.stringify(selected.parameters) === JSON.stringify(result.assumptions);
    const reason = data.agent ? null : report?.proposal.plans.find(p => p.strategy === result.strategy)?.reason;
    const title = result.strategy === 'wait' ? (data.scenario.confirmed ? 'Por vía principal' : 'Esperar confirmación') : 'Por Ladera';
    const local = result.strategy === 'wait' ? (data.scenario.confirmed ? 'R2 está confirmado dentro del ejercicio. T12 cruza primero y T31 espera su turno.' : 'T12 espera a la confirmación asumida. T31 utiliza R2 cuando T12 termina su recorrido.') : 'T12 utiliza el desvío si está disponible; T31 utiliza R2 cuando queda libre en el ejercicio.';
    return '<article class="plan' + (selectedSame ? ' selected' : '') + (!result.feasible ? ' invalid' : '') + '"><h3>' + title + '</h3>' +
      (result.feasible ? '<div class="plan-number">+' + result.metrics.totalDelay + '<small>min de demora acumulada</small></div>' : '<span class="plan-status">No disponible</span>') +
      '<p>' + escapeHtml(reason ?? local) + '</p><span class="reason-owner">' + (reason ? 'Interpretación de Meta · lectura guardada' : 'Descripción del ejercicio · sin IA') + '</span>' +
      (result.feasible ? '<div class="plan-facts">T12 llega en ' + result.metrics.t12Arrival + ' min · T31 llega en ' + result.metrics.t31Arrival + ' min</div>' : '<p>' + escapeHtml(result.reason) + '</p>') +
      '<button class="text-action" data-plan="' + result.strategy + '"' + (!result.feasible || busy || data.busy ? ' disabled' : '') + '>' + (selectedSame ? 'Volver a ensayar' : 'Ensayar esta respuesta') + ' <span aria-hidden="true">↗</span></button></article>';
  }).join('');
  $('plans').querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => action('branch', { strategy: button.dataset.plan })));
}
function planName(strategy) { return ({ wait: data?.scenario.confirmed ? 'Vía principal, por turnos' : 'Esperar confirmación', bypass: 'Desvío por Ladera', enter_now: data?.scenario.confirmed ? 'Acceso directo comprobado' : 'Entrar sin confirmar' })[strategy] ?? strategy; }
function renderAgent() {
  const run = data.agent, waiting = busy || data.busy;
  const trace = waiting ? data.agentProgress : run?.trace;
  const tests = waiting ? (trace ?? []).filter(s => s.tool === 'test_plan').map(s => s.result) : run?.tests ?? [];
  $('agent-work').hidden = !data.session.incident || (!run && !waiting);
  $('agent-origin').textContent = waiting ? 'Meta real / consulta en curso' : 'Meta real / consulta guardada · evidencia v' + (run?.evidenceVersion ?? '1');
  $('agent-title').textContent = waiting ? 'Meta está comprobando alternativas.' : modelText(run,'title') || 'Leer. Probar. Volver a decidir.';
  $('agent-summary').textContent = waiting ? ((trace ?? []).some(s => s.tool === 'read_reports') ? 'Ya ha leído los partes originales. Cada alternativa se ejecuta en el motor local y su resultado vuelve a Meta.' : 'Consultando los partes originales del ejercicio…') : modelText(run,'summary');
  $('agent-tests').innerHTML = ['wait','bypass','enter_now'].map(strategy => {
    const result = tests.find(t => t.strategy === strategy);
    return '<li class="' + (result ? result.feasible ? 'test-valid' : 'test-rejected' : 'test-pending') + '"><span>' + escapeHtml(planName(strategy)) + '</span><strong>' + (!result ? 'Pendiente' : result.feasible ? '+' + result.metrics.totalDelay + ' min' : 'Rechazado') + '</strong><small>' + escapeHtml(result?.reason ?? 'Aún no ejecutada por Meta en esta consulta.') + '</small></li>';
  }).join('');
  $('agent-verdict').hidden = !run || waiting;
  $('agent-question').textContent = modelText(run,'question');
  $('agent-rehearse').textContent = run ? 'Ensayar: ' + planName(run.proposal.recommendedStrategy) + ' ↗' : '';
  $('agent-rehearse').disabled = waiting;
  $('agent-trace-button').hidden = !run || waiting;
  $('agent-proof').textContent = waiting ? (trace?.length ?? 0) + ' herramientas completadas. Puedes cancelar desde el panel.' : run ? 'Muse Spark Open · ' + run.usage.calls + ' peticiones · ' + run.trace.length + ' herramientas · ' + (run.elapsedMs / 1000).toFixed(1) + ' s · resultados del motor, no predicciones de Meta.' : '';
  localize($('agent-work'));
}
function render() {
  const incident = data.session.incident, selected = branch(), report = analysis();
  const waiting = busy || data.busy;
  const interpreted = !!report || !!data.agent;
  const readingId = data.agent?.id ?? report?.id;
  if (readingId && readingId !== analysisId) { focused = data.agent ? matchMedia('(max-width:760px)').matches : report.proposal.focus === 'R2'; analysisId = readingId; }
  $('app').setAttribute('aria-busy', String(waiting));
  document.body.classList.toggle('busy', waiting);
  $('stage').classList.toggle('is-incident', incident);
  $('inspector').hidden = !incident;
  $('inspector').classList.toggle('has-analysis', interpreted);
  $('reading-detail').open = !interpreted;
  $('reading-summary').textContent = data.agent ? 'Interpretación tras los ensayos' : report ? 'Interpretación de Meta' : 'Qué ha cambiado';
  const titles = { '01': '¿Puede seguir<br>este tren?', '02': '¿Y si el desvío<br>está cerrado?', '03': '¿Quién pasa<br>primero?', '04': 'El aviso cambió.<br>El plan también.' };
  $('scene-title').innerHTML = titles[data.scenario.number];
  $('scene-description').textContent = incident ? data.scenario.task : data.scenario.context;
  $('scenario-name').textContent = 'Tu papel: coordinar la respuesta · Caso ficticio';
  $('case-number').textContent = data.scenario.number;
  $('case-select').innerHTML = data.catalog.map(s => '<option value="' + s.id + '">' + escapeHtml(s.title) + '</option>').join('');
  $('case-select').value = data.scenario.id;
  $('case-select').disabled = waiting;
  $('step-read').classList.toggle('current', !incident);
  $('step-meta').classList.toggle('current', incident && (!interpreted || waiting));
  $('step-try').classList.toggle('current', interpreted && !waiting);
  $('incident-button').hidden = incident;
  $('focus-button').hidden = !incident;
  $('focus-button').textContent = focused ? 'Ver red completa' : 'Enfocar R2';
  $('provider-state').textContent = waiting ? 'Meta está ensayando' : data.agent ? 'Meta · alternativas comprobadas' : report ? 'Meta · lectura guardada' : data.agentProvider.ready ? 'Meta conectado' : 'Nuevas consultas pausadas';
  $('provider-state').classList.toggle('ready', data.agentProvider.ready || !!report || !!data.agent);
  $('branch-count').textContent = String(data.session.branches.length);
  $('meta-button').disabled = waiting || !data.agentProvider.ready;
  $('meta-button').title = !data.agentProvider.ready ? 'El límite autorizado de créditos evita nuevas consultas. Los ensayos locales y las lecturas guardadas siguen disponibles.' : 'Meta leerá las fuentes y ejecutará las alternativas con el motor local.';
  $('meta-button').textContent = waiting ? 'Meta está probando alternativas…' : data.agent ? 'Volver a ensayar con Meta' : 'Probar alternativas con Meta';
  $('cancel-button').hidden = !waiting;
  for (const id of ['incident-button', 'rewind-button', 'shortcut-button', 'clearance', 'bypass-open']) $(id).disabled = waiting;
  $('clearance').disabled = waiting || data.scenario.confirmed;
  $('clearance').min = data.scenario.confirmed ? '0' : '1';
  $('bypass-open').disabled = waiting || data.scenario.bypassLockedClosed;
  $('clearance-label').innerHTML = data.scenario.confirmed ? 'Confirmación recibida en las fuentes del ejercicio <output id="clearance-value">0</output> min de espera adicional' : 'Hipótesis: confirmación de R2 libre en <output id="clearance-value">' + data.session.parameters.clearanceMinutes + '</output> min';
  $('assumption-note').textContent = data.scenario.confirmed ? 'La confirmación pertenece a los mensajes ficticios. Ahora comparamos el orden de paso de los trenes.' : data.scenario.bypassLockedClosed ? 'R5 está cerrado según el parte. Puedes variar la espera, pero no ignorar ese cierre.' : 'Tú eliges cuándo llegará la confirmación en esta rama. El modelo no predice ese momento.';
  $('incident-label').textContent = data.scenario.confirmed ? 'R2 · Confirmado en el ejercicio' : data.scenario.bypassLockedClosed ? 'R2 sin confirmar · R5 cerrado' : 'R2 · Confirmación pendiente';
  $('sources-button').textContent = 'Leer los ' + data.scenario.sources.length + ' avisos ↗';
  $('analysis-title').textContent = data.scenario.confirmed ? 'Dos trenes. Un tramo.' : data.scenario.bypassLockedClosed ? 'Ese desvío está cerrado.' : 'Falta una confirmación.';
  $('shortcut-button').textContent = data.scenario.confirmed ? 'Comprobar acceso directo' : 'Probar acceso sin confirmar';
  if (report) {
    $('analysis-summary').textContent = report.proposal.title + '. ' + report.proposal.summary;
    $('analysis-question').textContent = report.proposal.nextQuestion;
    $('question-owner').textContent = 'Pregunta propuesta por Meta';
    $('meta-status').textContent = 'Lectura guardada de Meta · ' + (report.elapsedMs / 1000).toFixed(1) + ' s · ' + report.proposal.evidence.length + ' fuentes citadas. Planes comprobados por el motor local.';
  } else {
    $('analysis-summary').textContent = data.scenario.context;
    $('analysis-question').textContent = data.scenario.question;
    $('question-owner').textContent = 'Pregunta del escenario, sin IA';
    $('meta-status').textContent = data.lastAnalysis ? 'La lectura anterior está conservada para otras condiciones. Consultar de nuevo consume créditos.' : 'Solo se envían los datos ficticios de este escenario.';
  }
  if (data.agent) {
    $('analysis-summary').textContent = modelText(data.agent,'summary');
    $('analysis-question').textContent = modelText(data.agent,'question');
    $('question-owner').textContent = 'Pregunta de Meta tras ejecutar los ensayos';
    $('meta-status').textContent = 'Consulta real guardada · ' + data.agent.tests.length + ' alternativas comprobadas · ' + (data.agent.elapsedMs / 1000).toFixed(1) + ' s.';
  }
  $('comparison').hidden = !comparing || !incident;
  $('clearance').value = data.session.parameters.clearanceMinutes;
  $('clearance-value').textContent = data.session.parameters.clearanceMinutes;
  $('bypass-open').checked = data.session.parameters.bypassOpen;
  renderPlans();
  $('play-button').disabled = !selected;
  $('timeline').disabled = !selected;
  $('timeline').max = String(selected?.simulation.metrics.duration ?? 12);
  $('timeline-end').textContent = selected ? clock(selected.simulation.metrics.duration) : 'Sin rama seleccionada';
  $('playback-title').textContent = selected ? selected.label : incident ? 'La incidencia está abierta' : 'Antes de la incidencia';
  $('playback-description').textContent = selected ? 'Demora acumulada: ' + selected.simulation.metrics.totalDelay + ' min · ' + (data.scenario.confirmed ? 'confirmación en las fuentes' : 'confirmación supuesta en ' + selected.parameters.clearanceMinutes + ' min') : incident ? 'Compara respuestas y elige una para ensayarla.' : 'Pulsa «Empezar este caso».';
  $('timeline-events').innerHTML = selected ? '<span>Inicio</span><span>' + (data.scenario.confirmed ? 'R2 confirmado en el ejercicio' : 'Confirmación asumida +' + selected.parameters.clearanceMinutes + ' min') + '</span><span>Fin del ensayo</span>' : '';
  $('export-link').hidden = data.session.branches.length === 0;
  $('save-status').textContent = 'Revisión ' + data.session.revision + ' · Guardado en este Mac';
  const changed = data.scenario.id === 'corridor-update-04';
  $('evidence-update').hidden = !incident || !['corridor-north-01','corridor-update-04'].includes(data.scenario.id);
  $('evidence-update').classList.toggle('has-update', changed);
  $('update-kicker').textContent = changed ? 'Evidencia / versión 02 · S4 recibido' : 'Evidencia / versión 01';
  $('update-title').textContent = changed ? 'R5 acaba de cerrarse.' : '¿Y si llega otro aviso?';
  $('update-description').textContent = changed ? data.scenario.sources.at(-1).text : 'Ensaya el desvío por Ladera. Después recibe un parte que cambia las condiciones de ese mismo caso.';
  $('notice-button').hidden = changed;
  $('notice-button').disabled = waiting;
  $('update-status').textContent = changed ? data.branchStatus.filter(b => b.affected).length + ' ensayos anteriores por Ladera han quedado desactualizados. Puedes abrirlos en «Ensayos», sin borrar ni reabrir el desvío.' : '';
  $('update-status').hidden = !changed;
  const historical = data.branchStatus.find(b => b.id === selected?.id);
  $('historical-banner').hidden = !historical?.stale;
  $('historical-banner').textContent = historical?.stale ? 'REPRODUCCIÓN HISTÓRICA · ' + historical.reason + ' Los avisos actuales siguen vigentes.' : '';
  renderAgent();
  renderNetwork();
  updateHeroScene();
  localize($('lab'));
  document.dispatchEvent(new Event('switch:state'));
  if (data.busy && !busy && !remotePoll) {
    remotePoll = setInterval(async () => {
      try { data = await request('/api/state'); if (!data.busy) { clearInterval(remotePoll); remotePoll = null; } render(); }
      catch { clearInterval(remotePoll); remotePoll = null; notify('No se pudo actualizar la consulta en curso. Recarga el laboratorio.', true); }
    }, 1000);
  }
}
async function runMeta() {
  pause(); data.agentProgress = []; busy = true; render();
  const started = performance.now();
  metaTimer = setInterval(() => { $('meta-status').textContent = translate('Meta real en Baseten · ' + Math.floor((performance.now() - started) / 1000) + ' s transcurridos. Puedes cancelar.'); }, 500);
  try {
    const polling = setInterval(async () => { try { const state = await request('/api/state'); data.agentProgress = state.agentProgress; renderAgent(); } catch {} }, 1200);
    try { data = await request('/api/rehearse', { revision: data.session.revision }); }
    finally { clearInterval(polling); }
    $('notice').hidden = true;
  } catch (error) {
    notify(error.message, true);
    data = await request('/api/state');
  } finally { clearInterval(metaTimer); busy = false; render(); }
}
function showDialog(html) {
  $('detail-content').innerHTML = html;
  localize($('detail-dialog'));
  if (!$('detail-dialog').open) $('detail-dialog').showModal();
}
function originalReport(text) {
  return getLanguage() === 'en' ? '<details class="original-report"><summary>Fuentes originales en español</summary><p data-original>' + escapeHtml(text) + '</p></details>' : '';
}
function showSources() {
  const cited = new Set((data.agent ?? analysis())?.proposal.evidence.map(e => e.sourceId) ?? []);
  showDialog('<span class="dialog-tag">' + data.scenario.sources.length + ' mensajes del escenario ficticio</span><h2 id="detail-title">Cada versión conserva su fuente.</h2>' + (getLanguage() === 'en' ? '<p class="translated-note">Vista traducida. Las citas originales se conservan.</p>' : '') + data.scenario.sources.map(s =>
    '<section class="source"><div class="source-top"><h3>' + s.id + ' · ' + s.title + '</h3><time>' + s.at + '</time></div><p>' + escapeHtml(translate(s.text)) + '</p>' + originalReport(s.text) + '<span class="source-attribute">' +
    (s.verifiedClearance ? 'Confirmación dentro del ejercicio' : s.kind === 'telemetry' ? 'Último dato · hace ' + s.ageSeconds + ' s' : s.kind === 'maintenance' ? 'Cierre explícito de R5' : 'No acredita R2 libre') + (cited.has(s.id) ? ' · Citada por Meta' : '') + '</span></section>').join('') +
    '<p class="engine-note">Todos estos mensajes son ficticios. «Confirmado» describe evidencia del ejercicio y no autoriza ningún movimiento real.</p>');
}
function showHistory() {
  showDialog('<span class="dialog-tag">El estado anterior se conserva</span><h2 id="detail-title">Tus ensayos.</h2>' +
    (data.session.branches.length ? '<ul class="branch-history">' + [...data.session.branches].reverse().map(b =>
      '<li><div><strong>' + escapeHtml(b.label) + '</strong><small>Caso ' + (data.catalog.find(s => s.id === (b.scenarioId ?? data.catalog[0].id))?.number ?? '?') + ' · ' + b.parameters.clearanceMinutes + ' min hasta confirmación · ' + b.simulation.metrics.totalDelay + ' min de demora</small>' + (data.branchStatus.find(v => v.id === b.id)?.stale ? '<small class="stale-label">Evidencia anterior a S4 · reproducción histórica</small>' : '') + '</div><button class="text-action" data-history="' + b.id + '">Abrir rama</button></li>').join('') + '</ul>' : '<p>Todavía no hay ramas. Abre un caso, compara respuestas y ensaya una.</p>') +
    '<p>' + data.session.analyses.length + ' lecturas guiadas y ' + data.session.agentRuns.length + ' ensayos de Meta con herramientas conservados.</p>');
  $('detail-content').querySelectorAll('[data-history]').forEach(button => button.addEventListener('click', async () => {
    $('detail-dialog').close(); comparing = true; await action('select_branch', { branchId: button.dataset.history });
  }));
}
function frame(now) {
  const selected = branch();
  if (!playing || !selected) return;
  if (lastFrame !== null) minute = Math.min(selected.simulation.metrics.duration, minute + (now - lastFrame) / 1000);
  lastFrame = now; renderNetwork();
  if (minute >= selected.simulation.metrics.duration) { pause(); return; }
  animationId = requestAnimationFrame(frame);
}
function setSpatialView(value) {
  view3d = value && !!spatial;
  $('stage').classList.toggle('view-2d', !view3d);
  $('world3d').hidden = !view3d;
  document.querySelector('.diagram-wrap').hidden = view3d;
  $('world-toolbar').hidden = !view3d; $('world-context').hidden = !view3d;
  $('view-3d').setAttribute('aria-pressed', String(view3d)); $('view-2d').setAttribute('aria-pressed', String(!view3d));
  spatial?.setEnabled(view3d);
}
function initSpatial() {
  spatial = createRailScene($('world3d'), { onUnavailable: () => { setSpatialView(false); $('view-3d').disabled = true; notify('Vista 3D no disponible. El mapa 2D sigue funcionando.'); } });
  heroSpatial = $('hero-world') ? createRailScene($('hero-world'), { hero: true }) : null;
  setSpatialView(!!spatial);
}
function updateHeroScene() {
  if(!heroSpatial || !data?.intro)return;
  const snapshot=data.intro.scenario;
  const positions=snapshot.trains.map(train=>({train,point:train.station?{...point(train.station),angle:0,pending:false,parked:true}:{
    x:point(train.from).x+(point(train.to).x-point(train.from).x)*train.progress,
    y:point(train.from).y+(point(train.to).y-point(train.from).y)*train.progress,angle:0,pending:true}}));
  heroSpatial.setState({stations:data.stations,edges:data.edges,positions,
    edgeStates:data.edges.map(e=>({id:e.id,active:false,closed:false,unknown:e.id==='R2'})),version:1,minute:0,
    evidenceHash:data.intro.agent?.scenarioHash??data.intro.reading?.scenarioHash,
    pendingLabel:getLanguage()==='en'?' · last reported':' · último dato'});
}
$('view-3d').addEventListener('click',()=>setSpatialView(true));
$('view-2d').addEventListener('click',()=>setSpatialView(false));
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
  focused=button.dataset.camera==='R2';lastSceneFocus=focused;
  spatial?.setPose(button.dataset.camera);
  $('focus-button').textContent=translate(focused?'Ver red completa':'Enfocar R2');
  renderNetwork();
  document.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
$('previous-plan').addEventListener('click',()=>{previousVisible=!previousVisible;spatial?.showPrevious(previousVisible);
  $('previous-plan').setAttribute('aria-pressed',String(previousVisible));$('previous-plan').textContent=translate(previousVisible?'Ocultar plan anterior':'Mostrar plan anterior');
  $('previous-plan-caption').hidden=!previousVisible;});
document.addEventListener('switch:language',()=>{if(data){render();localize(document);}});
$('incident-button').addEventListener('click', () => action('incident'));
$('notice-button').addEventListener('click', () => action('receive_notice'));
$('agent-trace-button').addEventListener('click', () => {
  const run = data.agent;
  if (!run) return;
  showDialog('<span class="dialog-tag">Consulta real guardada · Meta y motor local</span><h2 id="detail-title">Una propuesta que se puede revisar.</h2>' + run.trace.map(step => '<section class="source"><h3>' + step.step + ' / ' + ({ read_reports: 'Leer partes', test_plan: 'Ejecutar alternativa', submit_plan: 'Proponer con evidencia' }[step.tool]) + '</h3>' +
    (step.tool === 'read_reports' ? step.result.reports.map(s => '<p><b>' + s.id + ' · ' + s.at + '</b><br>' + escapeHtml(translate(s.text)) + '</p>' + originalReport(s.text)).join('') : step.tool === 'test_plan' ? '<p>' + escapeHtml(planName(step.result.strategy)) + ' · ' + (step.result.feasible ? '+' + step.result.metrics.totalDelay + ' min de demora' : 'RECHAZADO') + '</p><p>' + escapeHtml(step.result.reason) + '</p>' : '<p>' + escapeHtml(modelText(run,'summary')) + '</p>') + '</section>').join('') + '<p class="engine-note">Solo se conservan herramientas, fuentes y resultados. No se almacena razonamiento interno. Los cálculos pertenecen al modelo ficticio de reservas de tramos.</p>');
});
$('agent-rehearse').addEventListener('click', async () => { if (data.agent && await action('branch', { strategy: data.agent.proposal.recommendedStrategy })) $('play-button').click(); });
$('case-select').addEventListener('change', e => action('select_scenario', { scenarioId: e.target.value }));
$('rewind-button').addEventListener('click', () => action('rewind'));
$('focus-button').addEventListener('click', () => { focused = !focused; render(); });
$('meta-button').addEventListener('click', runMeta);
$('cancel-button').addEventListener('click', async () => { await request('/api/cancel', {}); notify('Cancelación solicitada. Se conserva el ensayo.'); });
$('compare-button').addEventListener('click', () => { comparing = true; render(); $('comparison').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); });
$('close-comparison').addEventListener('click', () => { comparing = false; render(); });
$('shortcut-button').addEventListener('click', () => action('branch', { strategy: 'enter_now' }));
$('sources-button').addEventListener('click', showSources);
$('history-button').addEventListener('click', showHistory);
$('about-button').addEventListener('click', () => showDialog('<span class="dialog-tag">SWITCH · Primer prototipo</span><h2 id="detail-title">Ensayar lo inesperado.</h2><p>Una red ficticia para explorar cómo cambia una decisión cuando la información es incompleta. Meta interpreta tres mensajes y propone preguntas y dos respuestas; el motor local comprueba reservas de tramos y tiempos declarados.</p><p>La vista cambia con la incidencia. Cada rama conserva sus hipótesis, resultados y fuentes. Puedes volver atrás sin borrar lo que ensayaste.</p><p class="engine-note">No hay telemetría ferroviaria real, control de trenes, reglas operativas certificadas ni predicción de accidentes. Los tiempos se expresan en minutos abstractos del escenario. La consulta usa Muse Spark Open en Baseten; la clave permanece en el servidor.</p>'));
$('clearance').addEventListener('input', e => { $('clearance-value').textContent = e.target.value; });
$('clearance').addEventListener('change', e => action('parameters', { parameters: { ...data.session.parameters, clearanceMinutes: Number(e.target.value) } }));
$('bypass-open').addEventListener('change', e => action('parameters', { parameters: { ...data.session.parameters, bypassOpen: e.target.checked } }));
$('timeline').addEventListener('input', e => { pause(); minute = Number(e.target.value); renderNetwork(); });
$('play-button').addEventListener('click', () => {
  const selected = branch(); if (!selected) return;
  if (playing) { pause(); return; }
  if (minute >= selected.simulation.metrics.duration) minute = 0;
  playing = true; lastFrame = null;
  $('play-button').innerHTML = '<span aria-hidden="true">Ⅱ</span>';
  $('play-button').setAttribute('aria-label', translate('Pausar rama')); animationId = requestAnimationFrame(frame);
});
$('world-play').addEventListener('click',async()=>{
  if(!data.session.incident&&!await action('incident'))return;
  if(!branch()&&data.agent){if(!await action('branch',{strategy:data.agent.proposal.recommendedStrategy},{scroll:false}))return;}
  $('play-button').click();renderNetwork();
});
$('world-time').addEventListener('input',e=>{pause();minute=Number(e.target.value);renderNetwork();});
$('world-zoom-in').addEventListener('click',()=>spatial?.zoom(.2));
$('world-zoom-out').addEventListener('click',()=>spatial?.zoom(-.2));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
try { data = await request('/api/state'); comparing = !!branch(); initSpatial(); render(); }
catch { $('app').setAttribute('aria-busy', 'false'); notify('No se puede abrir el escenario. Comprueba que el servidor local de SWITCH siga activo y recarga esta página.', true); }

export function storyContext() {
  return data?.intro ? structuredClone({ ...data.intro, stations: data.stations, edges: data.edges }) : null;
}
export async function openRehearsal(scenarioId, strategy) {
  if (!data || busy || data.busy) return false;
  if (!await action('select_scenario', { scenarioId })) return false;
  if (!await action('incident')) return false;
  if (strategy && !await action('branch', { strategy }, { scroll: false })) return false;
  comparing = !strategy; render();
  history.replaceState(null, '', '#lab');
  $('lab').scrollIntoView({ behavior: 'instant', block: 'start' });
  $('scene-title').focus({ preventScroll: true });
  if (strategy) $('play-button').click();
  return true;
}


// Read-only view for the dedicated workspace's evidence and occupancy surfaces.
export function workspaceContext(){return data?{scenario:data.scenario,catalog:data.catalog,incident:data.session.incident,parameters:data.session.parameters,branch:branch(),comparison:data.comparison,shortcut:data.shortcut,historical:!!data.branchStatus.find(b=>b.id===branch()?.id)?.stale,busy:busy||data.busy,minute}:null;}
export async function startWorkspaceCase(id){if(!data||busy||data.busy)return false;if(!await action('select_scenario',{scenarioId:id}))return false;return action('incident');}
export async function rehearseWorkspace(strategy){if(!data?.session.incident)return false;return action('branch',{strategy},{scroll:false});}
export function seekWorkspace(value){const selected=branch();if(!selected)return;pause();minute=Math.max(0,Math.min(selected.simulation.metrics.duration,Number(value)||0));renderNetwork();}
export function setWorkspaceEnabled(enabled){if(!enabled)pause();spatial?.setEnabled(enabled&&view3d);}

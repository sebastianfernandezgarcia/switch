import { createHash, randomUUID } from 'node:crypto';

export const STATIONS = [
  { id: 'A', name: 'Costa', x: 130, y: 355 },
  { id: 'B', name: 'Valle', x: 420, y: 355 },
  { id: 'C', name: 'Central', x: 850, y: 355 },
  { id: 'D', name: 'Norte', x: 1110, y: 355 },
  { id: 'E', name: 'Ladera', x: 635, y: 170 },
];
export const EDGES = [
  { id: 'R1', from: 'A', to: 'B', minutes: 3 },
  { id: 'R2', from: 'B', to: 'C', minutes: 4 },
  { id: 'R3', from: 'C', to: 'D', minutes: 3 },
  { id: 'R4', from: 'B', to: 'E', minutes: 3 },
  { id: 'R5', from: 'E', to: 'C', minutes: 3 },
];
export const STRATEGIES = ['wait', 'bypass', 'enter_now'];
export const SCENARIO = Object.freeze({
  id: 'corridor-north-01', version: 1, name: 'El corredor norte', fictional: true,
  startTime: '08:17', description: 'Tres trenes. Una confirmación pendiente.',
  sources: [
    { id: 'S1', at: '08:14:00', ageSeconds: 180, kind: 'telemetry', title: 'Última posición de T07', text: 'T07 fue observado en R2, entre Valle y Central. No se han recibido nuevas posiciones.', verifiedClearance: false },
    { id: 'S2', at: '08:16:40', ageSeconds: 20, kind: 'unverified_report', title: 'Mensaje de estación', text: 'R2 está disponible; T12 puede continuar. No se adjunta confirmación de salida de T07.', verifiedClearance: false },
    { id: 'S3', at: '08:16:55', ageSeconds: 5, kind: 'conflicting_report', title: 'Parte de coordinación', text: 'No podemos confirmar que T07 haya abandonado R2. La comprobación sigue pendiente.', verifiedClearance: false },
  ],
  trains: [
    { id: 'T07', name: 'T07', from: 'B', to: 'C', edge: 'R2', progress: 0.44, lastSeen: '08:14:00' },
    { id: 'T12', name: 'T12', from: 'C', to: 'B', station: 'C' },
    { id: 'T31', name: 'T31', from: 'A', to: 'C', station: 'A' },
  ],
  rules: [
    'A stale position and an unverified report do not confirm that R2 is clear.',
    'Every traversal reserves one whole edge for its abstract travel duration.',
    'Opposing and following trains cannot overlap on the same edge.',
    'Clearance time is a user-selected scenario assumption, never a prediction.',
  ],
});

export const DEFAULT_SCENARIO = SCENARIO.id;
const CLOSED = {
  ...SCENARIO, id: 'ladera-closed-02', name: 'El desvío también está cerrado', version: 1,
  sources: [
    { id: 'S1', at: '08:15:00', ageSeconds: 120, kind: 'telemetry', title: 'Último dato de T07', text: 'T07 permanece sin confirmación de salida de R2. El último dato disponible tiene dos minutos.', verifiedClearance: false },
    { id: 'S2', at: '08:16:20', ageSeconds: 40, kind: 'maintenance', title: 'Parte de mantenimiento', text: 'R5, entre Central y Ladera, está cerrado por mantenimiento en este ejercicio. No hay hora de reapertura.', verifiedClearance: false },
    { id: 'S3', at: '08:16:50', ageSeconds: 10, kind: 'unverified_report', title: 'Propuesta por radio', text: 'Se propone enviar T12 por Ladera. La propuesta no incorpora el cierre de R5 ni confirma la salida de T07.', verifiedClearance: false },
  ],
};
const CONFIRMED = {
  ...SCENARIO, id: 'clearance-received-03', name: 'La confirmación sí ha llegado', version: 1,
  sources: [
    { id: 'S1', at: '08:16:45', ageSeconds: 15, kind: 'exercise_clearance', title: 'Confirmación del ejercicio', text: 'En este ejercicio ficticio se confirma que T07 ha abandonado R2 por completo. R2 está libre desde las 08:16:45.', verifiedClearance: true },
    { id: 'S2', at: '08:16:50', ageSeconds: 10, kind: 'exercise_acknowledgement', title: 'Acuse de coordinación', text: 'Coordinación registra la confirmación de salida de T07. T12 espera en Central y T31 llega desde Costa; ambos necesitarán R2.', verifiedClearance: true },
    { id: 'S3', at: '08:16:55', ageSeconds: 5, kind: 'route_report', title: 'Estado del desvío', text: 'El desvío Central-Ladera-Valle está abierto en el ejercicio y requiere seis minutos. R2 requiere cuatro minutos.', verifiedClearance: false },
  ],
  trains: SCENARIO.trains.map(t => t.id === 'T07' ? { id: 'T07', name: 'T07', from: 'C', to: 'D', station: 'D' } : t),
  rules: [...SCENARIO.rules.slice(1, 3), 'R2 clearance is explicitly confirmed in the fictional exercise sources S1 and S2. No extra clearance wait is assumed.'],
};
export const UPDATED_SCENARIO = 'corridor-update-04';
const UPDATED = {
  ...SCENARIO, id: UPDATED_SCENARIO, version: 2, name: 'El aviso que cambia el plan',
  startTime: '08:18',
  sources: [...SCENARIO.sources.map(s => ({ ...s, ageSeconds: s.ageSeconds + 60 })), {
    id: 'S4', at: '08:17:35', ageSeconds: 25, kind: 'maintenance',
    title: 'Nuevo aviso de mantenimiento',
    text: 'Actualización del ejercicio: R5, entre Central y Ladera, queda cerrado por mantenimiento desde las 08:17:35. La propuesta de desvío anterior no es utilizable. No hay confirmación nueva sobre la salida de T07 de R2.',
    verifiedClearance: false,
  }],
};
const SCENARIOS = [SCENARIO, CLOSED, CONFIRMED, UPDATED];
const PRESENTATION = [
  { number: '01', title: 'Un aviso no es una confirmación', context: 'Un tren deja de enviar posiciones. Por radio dicen que el tramo está libre. No hay prueba de que haya salido.', task: 'Antes de mover T12, averigua qué falta y compara esperar o desviarlo.', question: '¿Quién puede confirmar que T07 ha salido por completo de R2?', defaults: { clearanceMinutes: 4, bypassOpen: true }, confirmed: false, bypassLockedClosed: false },
  { number: '02', title: 'La alternativa que no existe', context: 'R2 sigue sin confirmar. Alguien propone Ladera, pero el parte de mantenimiento ha cerrado ese desvío.', task: 'Contrasta la propuesta con el parte y descubre por qué una ruta atractiva no está disponible.', question: '¿Qué alternativa queda mientras R2 sigue sin confirmar y R5 está cerrado?', defaults: { clearanceMinutes: 6, bypassOpen: false }, confirmed: false, bypassLockedClosed: true },
  { number: '03', title: 'Confirmado no significa sin conflicto', context: 'T07 ya ha salido: esta vez hay confirmación. Ahora dos trenes necesitan el mismo tramo en sentidos opuestos.', task: 'Comprueba el acceso directo y compara qué orden de paso produce menos demora en este modelo.', question: 'Con R2 libre, ¿cómo se ordenan T12 y T31 para que no coincidan en ese tramo?', defaults: { clearanceMinutes: 0, bypassOpen: true }, confirmed: true, bypassLockedClosed: false },
  { number: '04', title: 'El mismo caso, un aviso nuevo', context: 'Acaba de llegar S4: mantenimiento cierra R5. El desvío que habías ensayado deja de estar disponible.', task: 'Revisa qué ha caducado y pide a Meta que vuelva a probar las alternativas con las cuatro fuentes.', question: 'Con R5 cerrado y R2 sin confirmar, ¿qué puede ensayarse ahora y qué debe verificarse primero?', defaults: { clearanceMinutes: 4, bypassOpen: false }, confirmed: false, bypassLockedClosed: true },
];
export function getScenario(id = DEFAULT_SCENARIO) {
  const index = SCENARIOS.findIndex(s => s.id === id);
  if (index < 0) throw new ScenarioError('UNKNOWN_SCENARIO', 'Ese caso no existe.');
  return structuredClone({ ...SCENARIOS[index], ...PRESENTATION[index] });
}
export function scenarioCatalog() { return SCENARIOS.map(s => { const v = getScenario(s.id); return { id: v.id, number: v.number, title: v.title, name: v.name }; }); }
export function branchStatus(branch, session) {
  const related = id => [DEFAULT_SCENARIO, UPDATED_SCENARIO].includes(id);
  const branchScenarioId = branch.scenarioId ?? DEFAULT_SCENARIO;
  const superseded = session.scenarioId === UPDATED_SCENARIO && branchScenarioId === DEFAULT_SCENARIO;
  return { id: branch.id, stale: superseded, affected: superseded && branch.strategy === 'bypass',
    reason: superseded ? (branch.strategy === 'bypass' ? 'S4 cierra R5. Este desvío pertenece a la versión anterior y ya no está disponible.' : 'Hay una fuente más reciente: S4. Este ensayo conserva la evidencia anterior.') : null,
    currentEvidence: related(branchScenarioId) && related(session.scenarioId) ? getScenario(session.scenarioId).version : getScenario(branchScenarioId).version };
}
export function receiveNotice(session) {
  if (session.scenarioId !== DEFAULT_SCENARIO || !session.incident)
    throw new ScenarioError('NOTICE_NOT_AVAILABLE', 'El aviso llega después de abrir el primer caso.');
  return { ...session, scenarioId: UPDATED_SCENARIO, revision: session.revision + 1,
    parameters: parameters({ ...session.parameters, bypassOpen: false }, UPDATED_SCENARIO), activeBranchId: null,
    activity: [...session.activity, { type: 'new_report_received', sourceId: 'S4', fromScenarioId: DEFAULT_SCENARIO,
      scenarioId: UPDATED_SCENARIO, at: new Date().toISOString() }] };
}
export function strategyLabel(strategy, scenarioId) {
  return strategy === 'bypass' ? 'Por Ladera' : strategy === 'enter_now' ? 'Acceso directo comprobado' : getScenario(scenarioId).confirmed ? 'Por vía principal' : 'Esperar confirmación';
}

export class ScenarioError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function parameters(input = {}, scenarioId = DEFAULT_SCENARIO) {
  const scenario = getScenario(scenarioId);
  const clearanceMinutes = input.clearanceMinutes ?? scenario.defaults.clearanceMinutes;
  const bypassOpen = input.bypassOpen ?? scenario.defaults.bypassOpen;
  if (!Number.isInteger(clearanceMinutes) || (scenario.confirmed ? clearanceMinutes !== 0 : clearanceMinutes < 1 || clearanceMinutes > 12) || typeof bypassOpen !== 'boolean')
    throw new ScenarioError('INVALID_PARAMETERS', 'La confirmación debe estar entre 1 y 12 minutos.');
  if (scenario.bypassLockedClosed && bypassOpen) throw new ScenarioError('BYPASS_LOCKED_CLOSED', 'El parte del caso cierra R5. Cambia de caso para explorar un desvío disponible.');
  return { clearanceMinutes, bypassOpen };
}
export function scenarioHash(input, scenarioId = DEFAULT_SCENARIO) {
  getScenario(scenarioId);
  return createHash('sha256').update(JSON.stringify({ scenario: SCENARIOS.find(s => s.id === scenarioId), parameters: parameters(input, scenarioId) })).digest('hex');
}
export function validateReservations(legs) {
  for (const leg of legs) {
    const edge = EDGES.find(e => e.id === leg.edge);
    if (!edge || ![edge.from, edge.to].includes(leg.from) || ![edge.from, edge.to].includes(leg.to) || leg.from === leg.to ||
        !Number.isFinite(leg.start) || !Number.isFinite(leg.end) || leg.end <= leg.start)
      throw new ScenarioError('INVALID_ROUTE', 'El recorrido contiene un tramo inválido.');
    if (leg.train !== 'T07' && leg.end - leg.start !== edge.minutes)
      throw new ScenarioError('INVALID_TRAVEL_TIME', 'El tiempo no coincide con la regla del escenario.');
  }
  for (let a = 0; a < legs.length; a++) for (let b = a + 1; b < legs.length; b++) {
    const x = legs[a], y = legs[b];
    if (x.edge === y.edge && x.train !== y.train && Math.max(x.start, y.start) < Math.min(x.end, y.end))
      throw new ScenarioError('EDGE_CONFLICT', 'Dos trenes coinciden en ' + x.edge + '.');
  }
  return true;
}
export function simulate(strategy, input = {}, scenarioId = DEFAULT_SCENARIO) {
  const scenario = getScenario(scenarioId), p = parameters(input, scenarioId);
  if (!STRATEGIES.includes(strategy)) throw new ScenarioError('INVALID_STRATEGY', 'Elige una respuesta disponible.');
  const base = { strategy, scenarioId, assumptions: p, conditional: true, modelScope: 'simplified_fictional_edge_reservations', sourceIds: scenario.sources.map(s => s.id) };
  if (strategy === 'enter_now' && !scenario.confirmed) return { ...base, feasible: false, code: 'CLEARANCE_NOT_CONFIRMED',
    reason: 'No hay confirmación de que R2 esté libre. Una posición vencida no despeja un tramo.', legs: [], events: [], metrics: null };
  if (strategy === 'bypass' && !p.bypassOpen) return { ...base, feasible: false, code: 'BYPASS_CLOSED',
    reason: 'La vía por Ladera está cerrada en esta rama del escenario.', legs: [], events: [], metrics: null };
  const clear = p.clearanceMinutes;
  const legs = scenario.confirmed ? [] : [{ train: 'T07', edge: 'R2', from: 'B', to: 'C', start: -2, end: clear, initialProgress: 0.44 }];
  if (strategy === 'wait' || strategy === 'enter_now') {
    legs.push({ train: 'T12', edge: 'R2', from: 'C', to: 'B', start: clear, end: clear + 4 });
    legs.push({ train: 'T31', edge: 'R1', from: 'A', to: 'B', start: 0, end: 3 });
    legs.push({ train: 'T31', edge: 'R2', from: 'B', to: 'C', start: Math.max(3, clear + 4), end: Math.max(3, clear + 4) + 4 });
  } else {
    legs.push({ train: 'T12', edge: 'R5', from: 'C', to: 'E', start: 0, end: 3 });
    legs.push({ train: 'T12', edge: 'R4', from: 'E', to: 'B', start: 3, end: 6 });
    legs.push({ train: 'T31', edge: 'R1', from: 'A', to: 'B', start: 0, end: 3 });
    legs.push({ train: 'T31', edge: 'R2', from: 'B', to: 'C', start: Math.max(3, clear), end: Math.max(3, clear) + 4 });
  }
  validateReservations(legs);
  const arrival = train => Math.max(...legs.filter(l => l.train === train).map(l => l.end));
  const events = [
    { minute: 0, kind: 'incident', text: scenario.confirmed ? 'Confirmación de R2 recibida en el ejercicio.' : 'Confirmación de R2 pendiente.' },
    ...(!scenario.confirmed ? [{ minute: clear, kind: 'assumption', text: 'Hipótesis del ensayo: llega la confirmación de R2 libre.' }] : []),
    ...legs.filter(l => l.train !== 'T07').flatMap(l => [
      { minute: l.start, kind: 'departure', train: l.train, edge: l.edge, text: l.train + ' inicia ' + l.edge + '.' },
      { minute: l.end, kind: 'arrival', train: l.train, edge: l.edge, text: l.train + ' termina ' + l.edge + '.' },
    ]),
  ].sort((a, b) => a.minute - b.minute);
  return { ...base, feasible: true, reason: 'Sin solapamientos de tramo en las reglas declaradas de este ensayo.', legs, events,
    metrics: { t12Arrival: arrival('T12'), t31Arrival: arrival('T31'), totalDelay: arrival('T12') - 4 + arrival('T31') - 7,
      totalTravelMinutes: legs.filter(l => l.train !== 'T07').reduce((s, l) => s + l.end - l.start, 0), duration: Math.max(arrival('T12'), arrival('T31')) } };
}
export function comparison(input, scenarioId) { return [simulate('wait', input, scenarioId), simulate('bypass', input, scenarioId)]; }
export function newSession() {
  return { id: randomUUID(), revision: 1, scenarioId: DEFAULT_SCENARIO, incident: false, parameters: parameters(), branches: [], activeBranchId: null, analyses: [],
    activity: [{ type: 'session_created', at: new Date().toISOString() }] };
}
export function addBranch(session, strategy) {
  if (!session.incident) throw new ScenarioError('INCIDENT_REQUIRED', 'Introduce primero la incidencia.');
  const scenarioId = session.scenarioId ?? DEFAULT_SCENARIO;
  const simulation = simulate(strategy, session.parameters, scenarioId);
  if (!simulation.feasible) throw new ScenarioError(simulation.code, simulation.reason);
  const branch = { id: randomUUID(), label: strategyLabel(strategy, scenarioId), scenarioId,
    strategy, parentRevision: session.revision, scenarioHash: scenarioHash(session.parameters, scenarioId),
    parameters: structuredClone(session.parameters), createdAt: new Date().toISOString(), simulation };
  return { ...session, revision: session.revision + 1, branches: [...session.branches, branch], activeBranchId: branch.id,
    activity: [...session.activity, { type: 'branch_created', branchId: branch.id, at: new Date().toISOString() }] };
}
export function rewind(session) {
  return { ...session, revision: session.revision + 1, incident: false, activeBranchId: null,
    activity: [...session.activity, { type: 'rewound_before_incident', at: new Date().toISOString() }] };
}

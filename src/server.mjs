import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { DEFAULT_SCENARIO, UPDATED_SCENARIO, getScenario, scenarioCatalog, STATIONS, EDGES, parameters, comparison, simulate, scenarioHash, newSession, addBranch, rewind, receiveNotice, branchStatus, ScenarioError } from './domain.mjs';
import { analyseIncident, providerStatus, MetaError } from './meta.mjs';
import { runRehearsalAgent, agentStatus } from './agent.mjs';
import { loadRecordedAnalyses } from './recordings.mjs';
import { loadRecordedAgentRuns } from './agent-recordings.mjs';
import { createLiveRailClient } from './live-rail.mjs';
import { reviewNetwork, verifyNetworkRecordings } from './network-review.mjs';
import { createGeographicGraph } from '../public/network-core.mjs';
import { exploreNetwork, verifyNetworkExplorations } from './network-agent.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ERRORS = {
  PROVIDER_NOT_READY: 'Meta necesita su configuración privada y margen de créditos disponible.',
  CREDIT_BUDGET_REACHED: 'Se ha alcanzado el límite autorizado de créditos. No se envió otra petición.',
  CREDIT_LEDGER_UNAVAILABLE: 'No se puede comprobar el registro privado de créditos. No se enviaron más peticiones.',
  PROVIDER_REJECTED: 'El proveedor ha rechazado la petición. Se conserva el ensayo; no se reintenta automáticamente.',
  PROVIDER_UNAVAILABLE: 'No se pudo conectar con Meta. Puedes seguir ensayando con las reglas locales.',
  ABORTED_OR_TIMEOUT: 'La consulta se canceló o llegó a su límite de tiempo. No se aplicó una respuesta.',
  INVALID_RESPONSE: 'Meta no entregó una propuesta válida. Se conserva el fallo, sin sustituirlo por un resultado simulado.',
  INVALID_PROPOSAL: 'La propuesta no cumple el formato o las condiciones del escenario.',
  INVALID_EVIDENCE: 'La propuesta no cita exactamente las fuentes del escenario.',
  AGENT_ROUND_LIMIT: 'La consulta alcanzó su límite sin una propuesta válida. No se sustituyó por un plan inventado.',
  UNTESTED_OR_REJECTED_PLAN: 'Meta propuso una alternativa que no había comprobado o que el motor rechazó. No se aplicó.',
  NEWEST_SOURCE_NOT_CITED: 'La propuesta omitía el aviso nuevo y se ha rechazado.',
};

export async function startServer(options = {}) {
  const env = options.env ?? process.env;
  const dataDir = options.dataDir ?? join(ROOT, '.data');
  const analyse = options.analyse ?? analyseIncident;
  const rehearse = options.rehearse ?? runRehearsalAgent;
  const liveRail = options.liveRail ?? createLiveRailClient();
  const explore = options.exploreNetwork ?? exploreNetwork;
  let networkData, networkGraph, networkRecordings, networkReviewBusy = false;
  let networkExplorations, networkController=null, networkProgress=[];
  let compressedRailAsset;
  async function ensureNetwork() {
    const shared = options.networkCache;
    if (shared && !networkData) {
      shared.base ??= readFile(join(ROOT, 'public/data/rail-network.json'), 'utf8').then(text => { const data = JSON.parse(text); return { data, graph: createGeographicGraph(data) }; });
      const base = await shared.base; networkData = base.data; networkGraph = base.graph;
    }
    if(!networkData){networkData=JSON.parse(await readFile(join(ROOT,'public/data/rail-network.json'),'utf8'));networkGraph=createGeographicGraph(networkData);}
    if(!networkRecordings){
      let doc={format:'switch-recorded-network-v1',records:[]};
      try{doc=JSON.parse(await readFile(join(ROOT,'examples/recorded-network.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      networkRecordings=verifyNetworkRecordings(networkData,doc,networkGraph);
    }
    if(!networkExplorations){let doc={format:'switch-network-explorations-v1',records:[]};try{doc=JSON.parse(await readFile(join(ROOT,'examples/recorded-explorations.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}networkExplorations=verifyNetworkExplorations(networkData,doc,networkGraph);}
  }
  await mkdir(join(dataDir, 'sessions'), { recursive: true, mode: 0o700 });
  await mkdir(join(dataDir, 'runs'), { recursive: true, mode: 0o700 });
  let session;
  try {
    session = JSON.parse(await readFile(join(dataDir, 'current.json'), 'utf8'));
    if (!session.id || !Number.isInteger(session.revision) || !Array.isArray(session.analyses) || !Array.isArray(session.branches))
      throw Error('Invalid saved session');
    session.scenarioId ??= DEFAULT_SCENARIO;
    parameters(session.parameters, session.scenarioId);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('SWITCH storage is unavailable; existing data was not replaced.');
    session = newSession();
    const recordedFile = options.recordedFile === undefined && !options.dataDir ? join(ROOT, 'examples', 'recorded-meta.json') : options.recordedFile;
    session.analyses = await loadRecordedAnalyses(recordedFile);
    const agentFile = options.agentRecordedFile === undefined && !options.dataDir ? join(ROOT, 'examples', 'recorded-agent.json') : options.agentRecordedFile;
    session.agentRuns = await loadRecordedAgentRuns(agentFile);
  }
  session.agentRuns ??= [];
  async function writeJson(file, value) {
    const temp = file + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
  }
  async function save(next) {
    await writeJson(join(dataDir, 'sessions', next.id + '.json'), next);
    await writeJson(join(dataDir, 'current.json'), next);
    session = next;
  }
  await save(session);
  let busy = null, agentProgress = [], agentProviderEvents = [], queue = Promise.resolve();
  function view() {
    const hash = scenarioHash(session.parameters, session.scenarioId);
    const introHash = scenarioHash({}, DEFAULT_SCENARIO);
    const selected = session.branches.find(b => b.id === session.activeBranchId);
    return { scenario: getScenario(session.scenarioId), catalog: scenarioCatalog(), stations: STATIONS, edges: EDGES, session,
      playbackScenario: getScenario(selected ? selected.scenarioId ?? DEFAULT_SCENARIO : session.scenarioId), evidenceHash: hash,
      intro: { scenario: getScenario(DEFAULT_SCENARIO), comparison: comparison({}, DEFAULT_SCENARIO),
        reading: session.analyses.findLast(a => a.scenarioHash === introHash) ?? null,
        agent: session.agentRuns.findLast(a => a.scenarioHash === introHash) ?? null },
      comparison: comparison(session.parameters, session.scenarioId), shortcut: simulate('enter_now', session.parameters, session.scenarioId),
      analysis: session.incident ? session.analyses.findLast(a => a.scenarioHash === hash) ?? null : null,
      lastAnalysis: session.analyses.at(-1) ?? null,
      agent: session.agentRuns.findLast(a => a.scenarioHash === hash) ?? null,
      branchStatus: session.branches.map(b => branchStatus(b, session)),
      noticeAvailable: session.scenarioId === DEFAULT_SCENARIO && session.incident,
      agentProvider: agentStatus(env), agentProgress,
      provider: providerStatus(env), busy: !!busy };
  }
  function send(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.rtve.es; font-src 'self'; connect-src 'self'; frame-src https://www.rtve.es; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
    res.end(type.startsWith('application/json') && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  }
  async function readBody(req) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new ScenarioError('JSON_REQUIRED', 'Se necesita una petición JSON.');
    let body = '';
    for await (const part of req) {
      body += part;
      if (Buffer.byteLength(body) > 8192) throw new ScenarioError('BODY_TOO_LARGE', 'La petición supera el límite.');
    }
    try { const data = JSON.parse(body); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
    catch { throw new ScenarioError('INVALID_JSON', 'La petición JSON no es válida.'); }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const host = req.headers.host;
      if (!['127.0.0.1:' + port, 'localhost:' + port].includes(host)) return send(res, 403, { error: 'HOST_REJECTED' });
      const route = new URL(req.url, 'http://' + host).pathname;
      if (req.method === 'GET' && route === '/api/deployment') return send(res, 200, { mode: 'local', newInference: agentStatus(env).ready });
      if (req.method === 'GET' && route === '/api/showcase') return send(res,200,view().intro);
      if (req.method === 'GET' && route === '/api/state') return send(res, 200, view());
      if (req.method === 'GET' && route === '/api/network/live') return send(res, 200, await liveRail());
      if (req.method === 'GET' && route === '/api/network/config') { await ensureNetwork();return send(res, 200, { ready: agentStatus(env).ready,recordings:networkRecordings,explorations:networkExplorations,metaPolicy:'explicit_user_request_only' }); }
      if (req.method === 'GET' && route === '/api/network/exploration') return send(res,200,{busy:!!networkController,trace:networkProgress});
      if (req.method === 'GET' && route === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="switch-rehearsals.json"');
        return send(res, 200, { format: 'switch-rehearsals-v1', exportedAt: new Date().toISOString(),
          scope: 'Fictional training prototype. No real train telemetry, movement authority or certified safety assessment.',
          scenarioCatalog: scenarioCatalog(), cases: scenarioCatalog().map(s => getScenario(s.id)), session,
          attribution: { interpretation: 'Real recorded Meta responses via Baseten when present; absence is explicit.',
            calculations: 'Local abstract edge-reservation engine, not model predictions.', humanReview: 'No professional validation claimed.' } });
      }
      const staticFiles = { '/console.css':['console.css','text/css; charset=utf-8'], '/tracking-model.mjs':['tracking-model.mjs','text/javascript; charset=utf-8'], '/simulator':['simulator.html','text/html; charset=utf-8'], '/simulator/':['simulator.html','text/html; charset=utf-8'], '/shell.js':['shell.js','text/javascript; charset=utf-8'], '/home.js':['home.js','text/javascript; charset=utf-8'], '/site.css':['site.css','text/css; charset=utf-8'], '/workspace.js':['workspace.js','text/javascript; charset=utf-8'], '/workspace.css':['workspace.css','text/css; charset=utf-8'], '/workspace-model.mjs':['workspace-model.mjs','text/javascript; charset=utf-8'], '/assets/switch-product-preview.png':['assets/switch-product-preview.png','image/png'], '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'],
        '/story.js': ['story.js', 'text/javascript; charset=utf-8'], '/story.css': ['story.css', 'text/css; charset=utf-8'],
        '/i18n.mjs': ['i18n.mjs','text/javascript; charset=utf-8'], '/scene3d.js': ['scene3d.js','text/javascript; charset=utf-8'], '/world.css': ['world.css','text/css; charset=utf-8'],
        '/network.js': ['network.js','text/javascript; charset=utf-8'], '/national-map.js': ['national-map.js','text/javascript; charset=utf-8'], '/network-core.mjs': ['network-core.mjs','text/javascript; charset=utf-8'], '/network.css': ['network.css','text/css; charset=utf-8'],
        '/network-copilot.js':['network-copilot.js','text/javascript; charset=utf-8'], '/experience.css':['experience.css','text/css; charset=utf-8'], '/data/incident-context.json':['data/incident-context.json','application/json; charset=utf-8'],
        '/data/rail-network.json': ['data/rail-network.json','application/json; charset=utf-8'], '/data/countries.json': ['data/countries.json','application/json; charset=utf-8'],
        '/vendor/three.module.js': ['vendor/three.module.js','text/javascript; charset=utf-8'], '/vendor/three.core.js': ['vendor/three.core.js','text/javascript; charset=utf-8'], '/vendor/OrbitControls.js': ['vendor/OrbitControls.js','text/javascript; charset=utf-8'], '/vendor/three-LICENSE.txt': ['vendor/three-LICENSE.txt','text/plain; charset=utf-8'],
        '/assets/hanken-grotesk.ttf': ['assets/hanken-grotesk.ttf', 'font/ttf'], '/assets/HankenGrotesk-OFL.txt': ['assets/HankenGrotesk-OFL.txt', 'text/plain; charset=utf-8'],
        '/assets/urda-incident.jpg': ['assets/urda-incident.jpg', 'image/jpeg'], '/assets/adamuz-ume-defensa-2026-01-21.jpg': ['assets/adamuz-ume-defensa-2026-01-21.jpg','image/jpeg'], '/assets/spain-context.svg': ['assets/spain-context.svg', 'image/svg+xml'] };
      if (req.method === 'GET' && staticFiles[route]) {
        if(route==='/data/rail-network.json'&&/\bgzip\b/.test(req.headers['accept-encoding']??'')){
          compressedRailAsset??=readFile(join(ROOT,'public/data/rail-network.json')).then(buffer=>promisify(gzip)(buffer));
          res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');
          return send(res,200,await compressedRailAsset,'application/json; charset=utf-8');
        }
        const [file, type] = staticFiles[route]; return send(res, 200, await readFile(join(ROOT, 'public', file)), type);
      }
      if (req.method !== 'POST' || !['/api/action', '/api/analyse', '/api/rehearse', '/api/cancel', '/api/network/review','/api/network/explore','/api/network/cancel'].includes(route)) return send(res, 404, { error: 'NOT_FOUND' });
      if (req.headers.origin !== 'http://' + host) return send(res, 403, { error: 'ORIGIN_REJECTED' });
      const body = await readBody(req);
      if(route==='/api/network/cancel'){networkController?.abort();return send(res,200,{cancelled:!!networkController});}
      if(route==='/api/network/explore'){
        if(body.trigger!=='user_request')return send(res,400,{error:'EXPLICIT_REQUEST_REQUIRED'});
        if(networkReviewBusy)return send(res,409,{error:'ANALYSIS_RUNNING'});
        networkReviewBusy=true;const controller=new AbortController();networkController=controller;networkProgress=[];const rejected=[],providerEvents=[];const runId='network-explore-'+randomUUID();
        try{
          await ensureNetwork();const observations=await liveRail();
          const result=await explore(networkData,body,{env,graph:networkGraph,live:observations,signal:controller.signal,onStep:trace=>{networkProgress=trace;},onRejected:attempt=>rejected.push(attempt),onProvider:event=>providerEvents.push(event)});
          if(controller.signal.aborted)throw new MetaError('ABORTED_OR_TIMEOUT');
          await writeJson(join(dataDir,'runs',runId+'.json'),{status:'completed',result});return send(res,200,result);
        }catch(error){const code=error instanceof MetaError?error.code:'INVALID_RESPONSE';await writeJson(join(dataDir,'runs',runId+'.json'),{status:'failed',code,at:new Date().toISOString(),trace:networkProgress,rejected,providerEvents,reasoningSaved:false});return send(res,502,{error:code,message:ERRORS[code]??'No se aplicó una exploración.'});}
        finally{networkReviewBusy=false;networkController=null;}
      }
      if(route === '/api/network/review') {
        if(networkReviewBusy)return send(res,409,{error:'ANALYSIS_RUNNING'});
        networkReviewBusy=true;const runId='network-'+randomUUID();
        try {
          await ensureNetwork();
          const result=await reviewNetwork(networkData,body,{env,graph:networkGraph});
          await writeJson(join(dataDir,'runs',runId+'.json'),{status:'completed',result});
          return send(res,200,result);
        }catch(error){const code=error instanceof MetaError?error.code:'INVALID_RESPONSE';await writeJson(join(dataDir,'runs',runId+'.json'),{status:'failed',code,at:new Date().toISOString(),reasoningSaved:false});return send(res,502,{error:code,message:ERRORS[code]??'No se aplicó una revisión.'});}
        finally{networkReviewBusy=false;}
      }
      if (route === '/api/cancel') {
        busy?.abort(); return send(res, 200, { cancelled: !!busy });
      }
      if (busy) return send(res, 409, { error: 'ANALYSIS_RUNNING', message: 'Espera a Meta o cancela la consulta antes de cambiar el escenario.' });
      if (body.revision !== session.revision) return send(res, 409, { error: 'REVISION_CONFLICT', message: 'El ensayo cambió. Se ha recuperado su estado actual.' });
      if (route === '/api/action') {
        const operation = queue.then(async () => {
          if (body.revision !== session.revision) throw new ScenarioError('REVISION_CONFLICT', 'El ensayo cambió.');
          let next;
          if (body.action === 'incident') next = { ...session, revision: session.revision + 1, incident: true, activeBranchId: null,
            activity: [...session.activity, { type: 'incident_introduced', at: new Date().toISOString() }] };
          else if (body.action === 'parameters') next = { ...session, revision: session.revision + 1, parameters: parameters(body.parameters, session.scenarioId), activeBranchId: null,
            activity: [...session.activity, { type: 'assumptions_changed', parameters: parameters(body.parameters, session.scenarioId), at: new Date().toISOString() }] };
          else if (body.action === 'select_scenario') {
            const scenario = getScenario(body.scenarioId);
            next = { ...session, scenarioId: scenario.id, revision: session.revision + 1, incident: false,
              activeBranchId: null, parameters: parameters({}, scenario.id),
              activity: [...session.activity, { type: 'scenario_selected', scenarioId: scenario.id, at: new Date().toISOString() }] };
          }
          else if (body.action === 'branch') next = addBranch(session, body.strategy);
          else if (body.action === 'receive_notice') next = receiveNotice(session);
          else if (body.action === 'rewind') next = rewind(session);
          else if (body.action === 'select_branch') {
            const selected = session.branches.find(b => b.id === body.branchId);
            if (!selected) throw new ScenarioError('BRANCH_NOT_FOUND', 'La rama no existe.');
            next = branchStatus(selected, session).stale
              ? { ...session, revision: session.revision + 1, incident: true, activeBranchId: body.branchId }
              : { ...session, revision: session.revision + 1, incident: true, activeBranchId: body.branchId,
                  parameters: structuredClone(selected.parameters), scenarioId: selected.scenarioId ?? DEFAULT_SCENARIO };
          } else throw new ScenarioError('INVALID_ACTION', 'Acción no disponible.');
          await save(next); return view();
        });
        queue = operation.catch(() => {});
        return send(res, 200, await operation);
      }
      if (!session.incident) return send(res, 400, { error: 'INCIDENT_REQUIRED', message: 'Introduce primero la incidencia.' });
      const controller = new AbortController(); busy = controller; agentProgress = []; agentProviderEvents = [];
      const runId = randomUUID(), startedAt = new Date().toISOString();
      const revision = session.revision;
      let resultRecorded = false;
      try {
        const isAgent = route === '/api/rehearse';
        const result = await (isAgent ? rehearse : analyse)(session.parameters, { env, signal: controller.signal, scenarioId: session.scenarioId,
          onStep: trace => { agentProgress = trace; }, onProvider: event => { agentProviderEvents.push(event); } });
        if (controller.signal.aborted) throw new MetaError('ABORTED_OR_TIMEOUT');
        if (revision !== session.revision) throw new ScenarioError('REVISION_CONFLICT', 'La respuesta pertenece a una versión anterior.');
        await writeJson(join(dataDir, 'runs', runId + '.json'), { status: 'completed', startedAt, result });
        resultRecorded = true;
        await save({ ...session, revision: session.revision + 1,
          ...(isAgent ? { agentRuns: [...session.agentRuns, result] } : { analyses: [...session.analyses, result] }),
          activity: [...session.activity, { type: isAgent ? 'meta_tool_rehearsal_completed' : 'meta_analysis_completed', analysisId: result.id, at: result.at }] });
        busy = null;
        return send(res, 200, view());
      } catch (error) {
        const code = error instanceof MetaError || error instanceof ScenarioError ? error.code : 'ANALYSIS_FAILED';
        await writeJson(join(dataDir, 'runs', runId + (resultRecorded ? '-apply-error' : '') + '.json'), { status: 'failed', startedAt, finishedAt: new Date().toISOString(),
          code, ...(route === '/api/rehearse' ? { mode: 'tool_using_agent', trace: agentProgress, providerEvents: agentProviderEvents } : {}), reasoningSaved: false, rawTransportSaved: false });
        busy = null;
        return send(res, 502, { error: code, message: ERRORS[code] ?? 'La consulta no se pudo aplicar. El escenario sigue conservado.' });
      }
    } catch (error) {
      const known = error instanceof ScenarioError;
      send(res, known ? (error.code === 'REVISION_CONFLICT' ? 409 : 400) : 500,
        { error: known ? error.code : 'LOCAL_STORAGE_OR_REQUEST_ERROR', message: known ? error.message : 'No se pudo guardar la acción. Se conserva el último estado disponible.' });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4352, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log('SWITCH: http://127.0.0.1:' + server.address().port + '/');
}

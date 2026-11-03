import { readFile } from 'node:fs/promises';
import { DEFAULT_SCENARIO, getScenario, parameters, scenarioHash, comparison, simulate } from './domain.mjs';
import { validateProposal, MODEL } from './meta.mjs';

// These are actual recorded responses, never generated fallback answers.
// Fresh installations can inspect them without a key or network request.
export async function loadRecordedAnalyses(file) {
  if (!file) return [];
  let document;
  try { document = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Recorded examples could not be read.'); }
  if (document.format !== 'switch-recorded-meta-v1' || !Array.isArray(document.records) || document.records.length > 10)
    throw new Error('Invalid recorded examples.');
  return document.records.map(record => {
    const scenarioId = record.scenarioId ?? DEFAULT_SCENARIO;
    getScenario(scenarioId);
    const p = parameters(record.parameters, scenarioId);
    if (record.provider !== 'baseten' || record.model !== MODEL || record.kind !== 'real_meta_inference_on_fictional_scenario' ||
        record.scenarioHash !== scenarioHash(p, scenarioId) || !Number.isFinite(Date.parse(record.at)) ||
        !Number.isSafeInteger(record.elapsedMs) || record.elapsedMs < 0 || typeof record.id !== 'string')
      throw new Error('Recorded evidence does not match its case.');
    return { id: record.id, at: record.at, provider: record.provider, model: record.model, kind: record.kind,
      elapsedMs: record.elapsedMs, scenarioId, scenarioHash: record.scenarioHash, parameters: p,
      proposal: validateProposal(record.proposal, scenarioId), results: comparison(p, scenarioId), shortcut: simulate('enter_now', p, scenarioId),
      origin: 'packaged_recording', reasoningSaved: false };
  });
}

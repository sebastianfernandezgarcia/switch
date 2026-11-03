import { readFile } from 'node:fs/promises';
import { createToolSession } from './agent.mjs';
import { MODEL } from './meta.mjs';

// Recordings are real provider outputs, never substituted for a live response.
// Every tool receipt is independently replayed locally before the recording can be shown.
export async function loadRecordedAgentRuns(file) {
  if (!file) return [];
  const doc = JSON.parse(await readFile(file, 'utf8'));
  if (doc.format !== 'switch-recorded-agent-v1' || !Array.isArray(doc.records) || doc.records.length > 8)
    throw Error('Invalid recorded agent manifest');
  return doc.records.map(record => {
    if (record.provider !== 'baseten' || record.model !== MODEL || record.kind !== 'real_meta_tool_using_rehearsal' ||
        !record.id || !record.at || record.reasoningSaved !== false || record.rawTransportSaved !== false ||
        !Array.isArray(record.trace) || record.trace.length > 12 || record.trace.at(-1)?.tool !== 'submit_plan')
      throw Error('Invalid recorded agent provenance');
    const session = createToolSession(record.scenarioId, record.parameters);
    if (session.hash !== record.scenarioHash || record.evidenceVersion !== session.scenario.version) throw Error('Recorded evidence hash mismatch');
    for (const step of record.trace) {
      const result = session.execute(step.tool, step.arguments);
      if (JSON.stringify(result) !== JSON.stringify(step.result)) throw Error('Recorded tool result mismatch');
    }
    if (JSON.stringify(record.tests) !== JSON.stringify(session.tests) ||
        JSON.stringify(record.proposal) !== JSON.stringify(record.trace.at(-1).arguments)) throw Error('Recorded conclusion mismatch');
    return { ...structuredClone(record), origin: 'packaged_recording', toolReplayVerified: true };
  });
}

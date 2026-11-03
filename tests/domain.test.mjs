import test from 'node:test';
import assert from 'node:assert/strict';
import { parameters, simulate, comparison, scenarioHash, validateReservations, newSession, addBranch, rewind, getScenario, scenarioCatalog } from '../src/domain.mjs';

test('stale telemetry never authorizes entry, even when the bypass is open', () => {
  for (let clearanceMinutes = 1; clearanceMinutes <= 12; clearanceMinutes++) {
    const result = simulate('enter_now', { clearanceMinutes, bypassOpen: true });
    assert.equal(result.feasible, false);
    assert.equal(result.code, 'CLEARANCE_NOT_CONFIRMED');
    assert.equal(result.legs.length, 0);
  }
});
test('both strategies reserve non-overlapping edges at every supported assumption', () => {
  for (let clearanceMinutes = 1; clearanceMinutes <= 12; clearanceMinutes++) {
    for (const result of comparison({ clearanceMinutes, bypassOpen: true })) {
      assert.equal(result.feasible, true);
      assert.equal(validateReservations(result.legs), true);
      assert.equal(result.conditional, true);
      const t31 = result.legs.filter(l => l.train === 'T31');
      assert.ok(t31[1].start >= t31[0].end);
      assert.ok(result.legs.filter(l => l.train !== 'T07' && l.edge === 'R2').every(l => l.start >= clearanceMinutes));
    }
  }
});
test('metrics come from the actual schedule and change when assumptions change', () => {
  const [wait, bypass] = comparison({ clearanceMinutes: 4, bypassOpen: true });
  assert.deepEqual([wait.metrics.t12Arrival, wait.metrics.t31Arrival, wait.metrics.totalDelay], [8, 12, 9]);
  assert.deepEqual([bypass.metrics.t12Arrival, bypass.metrics.t31Arrival, bypass.metrics.totalDelay], [6, 8, 3]);
  assert.equal(simulate('wait', { clearanceMinutes: 8 }).metrics.totalDelay, 17);
});
test('closing the bypass rejects that strategy but preserves the waiting alternative', () => {
  assert.equal(simulate('bypass', { bypassOpen: false }).code, 'BYPASS_CLOSED');
  assert.equal(simulate('wait', { bypassOpen: false }).feasible, true);
});
test('conflicting and malformed edge reservations are rejected', () => {
  assert.throws(() => validateReservations([
    { train: 'T12', edge: 'R2', from: 'C', to: 'B', start: 4, end: 8 },
    { train: 'T31', edge: 'R2', from: 'B', to: 'C', start: 5, end: 9 },
  ]), { code: 'EDGE_CONFLICT' });
  assert.throws(() => validateReservations([{ train: 'T12', edge: 'R2', from: 'A', to: 'B', start: 0, end: 4 }]), { code: 'INVALID_ROUTE' });
  assert.throws(() => validateReservations([{ train: 'T12', edge: 'R2', from: 'C', to: 'B', start: 0, end: 1 }]), { code: 'INVALID_TRAVEL_TIME' });
});
test('a branch freezes its own assumptions and survives rewind', () => {
  const start = { ...newSession(), incident: true };
  const saved = addBranch(start, 'bypass');
  saved.parameters.clearanceMinutes = 11;
  assert.equal(saved.branches[0].parameters.clearanceMinutes, 4);
  const before = rewind(saved);
  assert.equal(before.incident, false);
  assert.equal(before.activeBranchId, null);
  assert.equal(before.branches.length, 1);
  assert.equal(before.branches[0].simulation.metrics.t31Arrival, 8);
});
test('invalid strategy or assumption cannot manufacture a feasible branch', () => {
  for (const input of [{ clearanceMinutes: 0 }, { clearanceMinutes: 13 }, { clearanceMinutes: 2.5 }, { bypassOpen: 'yes' }])
    assert.throws(() => parameters(input), { code: 'INVALID_PARAMETERS' });
  assert.throws(() => simulate('teleport'), { code: 'INVALID_STRATEGY' });
  assert.throws(() => addBranch(newSession(), 'wait'), { code: 'INCIDENT_REQUIRED' });
});
test('scenario hashes distinguish conditions used for a saved Meta reading', () => {
  assert.equal(scenarioHash({}), scenarioHash({ clearanceMinutes: 4, bypassOpen: true }));
  assert.notEqual(scenarioHash({}), scenarioHash({ clearanceMinutes: 5 }));
  assert.notEqual(scenarioHash({}), scenarioHash({ bypassOpen: false }));
});
test('a maintenance closure cannot be silently reopened with a hypothetical checkbox', () => {
  const id = 'ladera-closed-02';
  assert.equal(simulate('bypass', {}, id).code, 'BYPASS_CLOSED');
  assert.equal(simulate('wait', {}, id).feasible, true);
  assert.throws(() => parameters({ bypassOpen: true }, id), { code: 'BYPASS_LOCKED_CLOSED' });
  assert.equal(simulate('enter_now', {}, id).code, 'CLEARANCE_NOT_CONFIRMED');
});
test('explicit exercise clearance permits access but still schedules opposing trains separately', () => {
  const id = 'clearance-received-03';
  const direct = simulate('enter_now', {}, id);
  assert.equal(direct.feasible, true);
  assert.equal(direct.legs.some(l => l.train === 'T07'), false);
  assert.equal(direct.legs.find(l => l.train === 'T31' && l.edge === 'R2').start, 4);
  assert.equal(validateReservations(direct.legs), true);
  const [main, bypass] = comparison({}, id);
  assert.equal(main.metrics.totalDelay, 1);
  assert.equal(bypass.metrics.totalDelay, 2);
  assert.ok(main.metrics.totalDelay < bypass.metrics.totalDelay);
  assert.throws(() => parameters({ clearanceMinutes: 4 }, id), { code: 'INVALID_PARAMETERS' });
});
test('case identity is preserved on branches and included in evidence hashes', () => {
  const scenarioId = 'clearance-received-03';
  const session = { ...newSession(), scenarioId, incident: true, parameters: parameters({}, scenarioId) };
  const saved = addBranch(session, 'wait');
  assert.equal(saved.branches[0].scenarioId, scenarioId);
  assert.notEqual(scenarioHash({}, scenarioId), scenarioHash({}));
  assert.equal(scenarioCatalog().length, 4);
  assert.throws(() => getScenario('invented'), { code: 'UNKNOWN_SCENARIO' });
});

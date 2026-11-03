import test from 'node:test';
import assert from 'node:assert/strict';
import {translate} from '../public/i18n.mjs';
import {getScenario,UPDATED_SCENARIO,scenarioHash} from '../src/domain.mjs';

test('translated report presentation preserves the immutable Spanish source and evidence hash',()=>{
  const scenario=getScenario(UPDATED_SCENARIO),before=structuredClone(scenario),hash=scenarioHash({},scenario.id);
  const english=scenario.sources.map(s=>translate(s.text,'en'));
  assert.ok(english.every((text,i)=>text!==scenario.sources[i].text));
  assert.ok(english[3].includes('08:17:35')&&english[3].includes('R5'));
  assert.deepEqual(scenario,before);assert.equal(scenarioHash({},scenario.id),hash);
  assert.equal(translate(scenario.sources[3].text,'es'),scenario.sources[3].text);
});
test('dynamic branch labels retain their numbers and distinguish historical evidence',()=>{
  assert.equal(translate('Demora acumulada: 9 min · confirmación supuesta en 4 min','en'),'Total delay: 9 min · clearance assumed in 4 min');
  assert.equal(translate('Caso 04 · 4 min hasta confirmación · 9 min de demora','en'),'Case 04 · 4 min to assumed clearance · 9 min of delay');
  assert.equal(translate('T31 termina R2.','en'),'T31 completes R2.');
});

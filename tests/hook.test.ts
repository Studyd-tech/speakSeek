import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// @ts-expect-error Node CLI adapter is intentionally standalone ESM.
import {convert} from '../../scripts/cursor-stop.mjs';
const fixture=JSON.parse(readFileSync('tests/fixtures/cursor-stop.json','utf8'));
test('Cursor stop adapter matches documented common/stop fields and excludes sensitive payloads',()=>{const e=convert(fixture);assert.equal(e.agentId,'cursor');assert.equal(e.type,'completed');assert.match(e.summary,/loop outcome/);assert.ok(!JSON.stringify(e).includes('/example/project'));assert.equal(convert({...fixture,status:'error'}).type,'failed');assert.equal(convert({...fixture,status:'aborted'}).type,'aborted');assert.throws(()=>convert({...fixture,hook_event_name:'invented'}));assert.throws(()=>convert({...fixture,status:'invented'}));assert.throws(()=>convert({...fixture,loop_count:-1}))});
// @ts-expect-error Standalone ESM adapter.
import {prepare} from '../../scripts/cursor-stop.mjs';
import {setup} from './helpers.js';
import {join} from 'node:path';
test('Cursor generation isolation, loop ordering, and durable replay timestamps',()=>{const c=setup();try{const path=join(c.dir,'hook.sqlite');const a=prepare(fixture,path);const b=prepare(fixture,path);assert.deepEqual(a,b);assert.equal(a.sequence,0);const next=prepare({...fixture,loop_count:1},path);assert.equal(a.sessionId,next.sessionId);assert.equal(next.sequence,1);const other=prepare({...fixture,generation_id:'other-generation'},path);assert.notEqual(other.sessionId,a.sessionId);assert.ok(!JSON.stringify(a).includes(fixture.generation_id))}finally{c.cleanup()}});

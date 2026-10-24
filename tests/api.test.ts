import {expect,test} from 'vitest';
import {Runtime} from '../src/server/runtime';
import {seedConditions} from '../src/demo/seed';
import {sameOrigin} from '../src/server/http';
async function setup(){const r=new Runtime(()=>new Date('2026-10-24T12:00:00Z'));for(const id of ['alex','maya','jay','dev']){r.setConditions(id,seedConditions[id]);await r.command(id,{type:'approve_discovery',expectedRevision:r.view(id).revision,expiresAt:'2026-10-25T12:00:00Z'})}return r}
test('student serialization keeps identities and private conditions out of proposal payloads',async()=>{
 const r=await setup();const a=r.view('alex');expect(a.proposal?.stage).toBe('awaiting_reveal');expect(JSON.stringify(a.proposal)).not.toMatch(/Maya|Jay|Dev|memberIds|reasonCode/);expect(r.view('dev').proposal).toBeNull();
 const p=r.machine.proposal!;for(const id of p.memberIds)await r.command(id,{type:'reveal',proposalId:p.id,version:p.version,decision:'approve'});
 expect(r.view('alex').proposal).toMatchObject({memberNames:['Alex','Maya','Jay'],ownAttendance:'pending'});
 await r.command('alex',{type:'withdraw',proposalId:p.id,version:p.version});
 expect(r.view('jay').recheck?.text).toBe('the group changed to 2. still down, or pass?');expect(r.view('jay').conditions?.minGroupSize).toBe(3);expect(r.view('maya').proposal?.stage).toBe('evaluating');expect(r.view('alex').discoveryApproved).toBe(false);
});
test('explicit adjustment requires fresh reveal and attendance',async()=>{
 const r=await setup(),p=r.machine.proposal!;await r.command('alex',{type:'withdraw',proposalId:p.id,version:1});const jay=r.view('jay');
 await r.command('jay',{type:'answer_recheck',proposalId:p.id,version:p.version,expectedRevision:jay.revision,decision:'approve_change',conditions:jay.recheck!.proposedConditions});
 expect(r.view('jay').conditions?.minGroupSize).toBe(2);expect(r.view('maya').proposal?.stage).toBe('awaiting_reveal');expect(r.machine.proposal?.version).toBe(3);
});
test('rejects cross-origin writes and unknown student IDs',()=>{expect(()=>sameOrigin(new Request('https://example.com/api',{headers:{Origin:'https://other.com'}}))).toThrow();expect(()=>new Runtime().view('stranger')).toThrow()});

import {expect,test} from 'vitest';
import {findGroup} from '../src/server/coordinator';
import {ProtocolLog} from '../src/server/protocol';
import {checkConditions} from '../src/domain/constraints';
import {students,events,seedConditions} from '../src/demo/seed';
import type {PersonalAgent} from '../src/domain/types';
test('isolated evaluations find three participants and record the two-person failure',()=>{
 const agents:PersonalAgent[]=students.map(student=>({id:student.id,evaluate:r=>checkConditions(seedConditions[student.id],r.event,r.memberIds,student),getInterestAdvertisements:()=>[{agentId:student.id,activityTags:['dance'],expiresAt:'2099-01-01T00:00:00Z'}]}));
 const log=new ProtocolLog();
 expect(findGroup(agents,events,new Date(),log.emit)?.memberIds).toEqual(['alex','maya','jay']);
 const responses=log.read().filter(e=>e.type==='EVAL_RESPONSE');
 expect(responses.some(e=>e.payload.agentId==='jay'&&e.payload.verdict==='reject'&&e.payload.reasonCode==='GROUP_TOO_SMALL')).toBe(true);
 expect(responses.some(e=>e.payload.agentId==='dev'&&e.payload.verdict==='reject'&&e.payload.reasonCode==='WRONG_DAY')).toBe(true);
 expect(JSON.stringify(log.rows())).not.toContain('Dev');
});

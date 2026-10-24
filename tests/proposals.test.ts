import {expect,test} from 'vitest';
import {ProposalMachine} from '../src/domain/proposals';
import {ProtocolLog} from '../src/server/protocol';
import {events} from '../src/demo/seed';
function setup(){let time=new Date('2026-10-24T12:00:00Z');const log=new ProtocolLog(()=>time);const m=new ProposalMachine(log.emit,()=>time,ids=>ids.map(id=>id.toUpperCase()),1000);m.create('p',events[0],['alex','maya','jay']);return {m,log,tick:()=>{time=new Date(time.getTime()+1001)}}}
test('all-or-nothing reveal has anonymous requests and separate attendance',()=>{
 const {m,log}=setup();
 for(const e of log.read())if(e.type==='REVEAL_REQUEST')expect(JSON.stringify(e.payload)).not.toMatch(/alex|maya|jay|memberNames/i);
 m.reveal('p',1,'alex','approve');m.reveal('p',1,'maya','approve');expect(log.read().some(e=>e.type==='REVEAL')).toBe(false);
 m.reveal('p',1,'jay','approve');expect(log.read().filter(e=>e.type==='REVEAL')).toHaveLength(3);expect(m.proposal?.status).toBe('awaiting_attendance');expect(Object.values(m.proposal!.attendance)).toEqual(['pending','pending','pending']);
});
test('pass closes and suppresses immediate subset matching',()=>{
 const {m}=setup();m.reveal('p',1,'alex','pass');expect(m.proposal?.status).toBe('closed');expect(m.cooldowns).toHaveLength(1);expect(m.blocked('dance',['maya','jay'])).toBe(true);expect(()=>m.reveal('p',1,'jay','approve')).toThrow();
});
test('expiry closes and approval races cannot reveal',()=>{
 const {m,log,tick}=setup();m.reveal('p',1,'alex','approve');tick();expect(()=>m.reveal('p',1,'maya','approve')).toThrow();expect(log.read().some(e=>e.type==='REVEAL')).toBe(false);expect(m.cooldowns).toHaveLength(1);
});
test('withdrawal and detail changes invalidate prior approvals',()=>{
 const {m}=setup();for(const id of ['alex','maya','jay'])m.reveal('p',1,id,'approve');m.attend('p',1,'jay','in');m.withdraw('p',1,'alex');
 expect(m.proposal?.version).toBe(2);expect(m.proposal?.status).toBe('evaluating');expect(m.proposal?.attendance.jay).toBe('pending');expect(m.proposal?.revealApprovals.jay).toBe('pending');expect(()=>m.attend('p',1,'jay','in')).toThrow();
 m.change(['maya','jay'],{...events[0],price:9});expect(m.proposal?.version).toBe(3);
});
test('nonmembers and duplicate decisions cannot approve',()=>{const {m}=setup();expect(()=>m.reveal('p',1,'dev','approve')).toThrow();m.reveal('p',1,'alex','approve');expect(()=>m.reveal('p',1,'alex','approve')).toThrow()});

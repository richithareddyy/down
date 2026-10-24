import {expect,test} from 'vitest';
import {Runtime} from '../src/server/runtime';
import {runScript} from '../src/demo/script';
import {seedFallback} from '../src/agents/seed-fallbacks';
test('script performs real commands, reveals unanimously and leaves attendance pending',async()=>{
 const r=new Runtime(()=>new Date(),async(text,own)=>seedFallback(text,own));await runScript(r,async()=>{});
 expect(r.machine.proposal?.memberIds).toEqual(['alex','maya','jay']);expect(r.machine.proposal?.status).toBe('awaiting_attendance');expect(r.scriptRunning).toBe(false);
 const log=r.log.read();expect(log.filter(e=>e.type==='REVEAL_DECISION')).toHaveLength(3);expect(log.filter(e=>e.type==='REVEAL')).toHaveLength(3);expect(log.filter(e=>e.type==='ATTEND_DECISION')).toHaveLength(0);
 expect(r.view('dev').proposal).toBeNull();
});
test('reset cancels a running script without late mutations',async()=>{
 const r=new Runtime();let count=0;await runScript(r,async()=>{if(++count===2)r.reset()});expect(r.machine.proposal).toBeNull();expect(r.view('alex').messages).toHaveLength(0);expect(r.scriptRunning).toBe(false);
});

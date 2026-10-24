import type {Runtime} from '../server/runtime';
import {seedMessages} from './seed';
export async function runScript(runtime:Runtime,wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 if(runtime.scriptRunning)return;
 runtime.reset();const generation=runtime.generation;runtime.scriptRunning=true;
 const current=()=>runtime.generation===generation;
 const step=(text:string)=>{runtime.scriptStep=text;runtime.notify()};
 try{
  step('four private interests. nobody asks first.');
  for(const [id,text] of Object.entries(seedMessages)){
   const message=`For beginner dance: ${text}`;
   for(let i=0;i<=message.length;i+=4){if(!current())return;runtime.setDraft(id,message.slice(0,i));await wait(35)}
   if(!current())return;runtime.setDraft(id,'');await runtime.command(id,{type:'intake',text:message});
   if(!current())return;await wait(500);
  }
  step('each student reviews their own conditions.');await wait(1000);
  for(const id of Object.keys(seedMessages)){
   if(!current())return;await runtime.command(id,{type:'approve_discovery',expectedRevision:runtime.view(id).revision,expiresAt:new Date(Date.now()+86400000).toISOString()});await wait(500);
  }
  if(!current())return;
  step('a group that works. no names shared yet.');await wait(1600);
  const p=runtime.machine.proposal;if(!p||p.status!=='awaiting_reveal')throw new Error('no feasible proposal');
  for(const id of [...p.memberIds]){
   if(!current())return;await runtime.command(id,{type:'reveal',proposalId:p.id,version:p.version,decision:'approve'});await wait(900);
  }
  if(current())step('it’s mutual. attendance is still your call.');
 }catch{
  if(current())step('demo paused. reset to try the sequence again.');
 }finally{if(current()){runtime.scriptRunning=false;runtime.notify()}}
}

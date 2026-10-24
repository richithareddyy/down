import { RequestLanguage } from '../agents/language';
import { students, events, circle } from '../demo/seed';
import type { AgentStore, Conditions, IntakeResult, RecheckPrompt, StudentCommand, StudentView, StudentProposalView } from '../domain/types';
import { createAgentStore } from './store';
import { StudentAgent } from '../agents/personal-agent';
import { ProtocolLog } from './protocol';
import { ProposalMachine, DomainError, summarize } from '../domain/proposals';
import { findGroup } from './coordinator';
export type Parser=(text:string,ownConditions:Conditions|null)=>Promise<IntakeResult>;
export class Runtime {
 private stores=new Map<string,AgentStore>();
 private agents=new Map<string,StudentAgent>();
 private prompts=new Map<string,RecheckPrompt>();
 private drafts=new Map<string,string>();
 setDraft(id:string,text:string){this.store(id);this.drafts.set(id,text);this.notify()}
 private listeners=new Set<()=>void>();
 log:ProtocolLog;
 machine:ProposalMachine;
 generation=0;
 scriptRunning=false;
 scriptStep='ready when you are';
 constructor(private now:()=>Date=()=>new Date(),private parser:Parser=(text,own)=>new RequestLanguage().parse(text,own)){
  this.log=new ProtocolLog(now);
  this.machine=new ProposalMachine(this.log.emit,now,ids=>ids.map(id=>students.find(s=>s.id===id)!.name));
  this.seedStores();
 }
 private seedStores(){for(const s of students){const store=createAgentStore(s);this.stores.set(s.id,store);this.agents.set(s.id,new StudentAgent(store,this.now))}}
 private store(id:string){const store=this.stores.get(id);if(!store)throw new DomainError('NOT_FOUND','student not found');return store}
 subscribe(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}}
 notify(){for(const listener of this.listeners)listener()}
 reset(){this.generation++;this.scriptRunning=false;this.scriptStep='ready when you are';this.stores.clear();this.agents.clear();this.prompts.clear();this.drafts.clear();this.log=new ProtocolLog(this.now);this.machine=new ProposalMachine(this.log.emit,this.now,ids=>ids.map(id=>students.find(s=>s.id===id)!.name));this.seedStores();this.notify()}
 private message(id:string,text:string,role:'student'|'agent'='agent'){
  const store=this.store(id),state=store.read();store.update(state.revision,{...state,messages:[...state.messages,{id:crypto.randomUUID(),role,text,createdAt:this.now().toISOString()}]});
 }
 setConditions(id:string,conditions:Conditions){const store=this.store(id),state=store.read();store.update(state.revision,{...state,conditions,discoveryApproved:false,discoveryExpiresAt:null,interests:[],activeInterestCount:0})}
 discover(){
  this.tick();const p=this.machine.proposal;if(p&&p.status!=='closed')return;
  const match=findGroup([...this.agents.values()],events,this.now(),this.log.emit,this.machine.blocked);
  if(match)this.machine.create(match.proposalId,match.event,match.memberIds);
  this.notify();
 }
 tick(){
  const p=this.machine.proposal;this.machine.expire();
  if(p&&p.status!=='closed'&&p.status!=='confirmed'&&p.memberIds.some(id=>!this.agents.get(id)!.getInterestAdvertisements(this.now().toISOString()).length))this.machine.close();
 }
 private recheck(){
  const p=this.machine.proposal!;this.prompts.clear();if(p.status==='closed')return;
  for(const id of p.memberIds){
   const verdict=this.agents.get(id)!.evaluate({proposalId:p.id,version:p.version,event:p.eventSnapshot,memberIds:p.memberIds});
   this.log.emit('EVAL_RESPONSE',id,'coordinator',{proposalId:p.id,version:p.version,agentId:id,...verdict});
   if(verdict.verdict==='reject'){
    const own=this.store(id).read().conditions!;
    const proposed=structuredClone(own);
    let text=`the group changed to ${p.memberIds.length}. your conditions no longer fit. pass for now?`;
    if(verdict.reasonCode==='GROUP_TOO_SMALL'){proposed.minGroupSize=p.memberIds.length;text=`the group changed to ${p.memberIds.length}. still down, or pass?`}
    if(verdict.reasonCode==='NO_APPROVED_FRIEND'){proposed.requireApprovedFriend=false;text=`the group changed to ${p.memberIds.length}. go without an approved friend, or pass?`}
    this.prompts.set(id,{proposalId:p.id,version:p.version,groupSize:p.memberIds.length,text,proposedConditions:proposed});
   }
  }
  if(!this.prompts.size)this.machine.requestReveal();
 }
 async command(id:string,command:StudentCommand){
  this.store(id);this.tick();const p=this.machine.proposal;
  if(command.type==='intake'){
   if(p&&p.status!=='closed'&&p.memberIds.includes(id))throw new DomainError('NOT_ALLOWED','finish or withdraw from your current proposal before starting another interest');
   const generation=this.generation;this.message(id,command.text,'student');const before=this.store(id).read();
   const parsed=await this.parser(command.text,before.conditions);
   if(generation!==this.generation)throw new DomainError('STALE_VERSION','the demo was reset');
   if(this.store(id).read().revision!==before.revision)throw new DomainError('STALE_VERSION','your request changed while it was being interpreted');
   if(parsed.kind==='parsed'){
    const reply=await new RequestLanguage().phrase({conditions:parsed.conditions,intent:'review'});
    if(generation!==this.generation||this.store(id).read().revision!==before.revision)throw new DomainError('STALE_VERSION','your request changed while it was being interpreted');
    this.setConditions(id,parsed.conditions);this.message(id,reply);
   }else this.message(id,parsed.question);
  }else if(command.type==='edit_conditions'){
   if(p&&p.status!=='closed'&&p.memberIds.includes(id))throw new DomainError('NOT_ALLOWED','withdraw before changing conditions for an active proposal');
   this.setConditions(id,command.conditions);
  }else if(command.type==='approve_discovery'){
   this.agents.get(id)!.approveDiscovery(command.expectedRevision,command.expiresAt);
   if([...this.agents.values()].every(a=>a.getInterestAdvertisements(this.now().toISOString()).length))this.discover();
  }else if(command.type==='reveal')this.machine.reveal(command.proposalId,command.version,id,command.decision);
  else if(command.type==='attendance'){
   this.machine.attend(command.proposalId,command.version,id,command.decision);
   if(command.decision==='out'){this.agents.get(id)!.revoke();this.recheck()}
  }else if(command.type==='withdraw'){
   this.machine.withdraw(command.proposalId,command.version,id);this.agents.get(id)!.revoke();this.message(id,'you’ve withdrawn. your interest is no longer in discovery.');this.recheck();
  }else if(command.type==='answer_recheck'){
   this.machine.current(command.proposalId,command.version,id);const prompt=this.prompts.get(id);
   if(!prompt||prompt.version!==command.version)throw new DomainError('STALE_VERSION','review the latest group change');
   if(command.decision==='pass'){this.machine.close();this.prompts.clear()}
   else{
    if(JSON.stringify(command.conditions)!==JSON.stringify(prompt.proposedConditions))throw new DomainError('INVALID_INPUT','approve the specific change shown');
    this.agents.get(id)!.replaceReviewedConditions(command.conditions,command.expectedRevision);
    this.machine.change(this.machine.proposal!.memberIds,this.machine.proposal!.eventSnapshot);this.recheck();
   }
  }
  this.notify();return this.view(id);
 }
 view(id:string):StudentView{
  this.tick();const state=this.store(id).read(),student=this.store(id).readStudent(),p=this.machine.proposal;
  let proposal:StudentProposalView|null=null;
  if(p&&p.memberIds.includes(id)){
   const ref={proposalId:p.id,version:p.version};
   if(p.status==='closed')proposal={...ref,stage:'closed',message:'this proposal has closed. no new disclosure was made.'};
   else if(p.status==='evaluating')proposal={...ref,stage:'evaluating',event:summarize(p.eventSnapshot),groupSize:p.memberIds.length};
   else if(p.status==='awaiting_reveal')proposal={...ref,stage:'awaiting_reveal',event:summarize(p.eventSnapshot),groupSize:p.memberIds.length,ownDecision:p.revealApprovals[id],expiresAt:p.expiresAt};
   else proposal={...ref,stage:p.status,event:summarize(p.eventSnapshot),memberNames:students.filter(s=>p.memberIds.includes(s.id)).map(s=>s.name),ownAttendance:p.attendance[id]};
  }
  return {self:{id:student.id,name:student.name},circleName:circle.name,draftText:this.drafts.get(id)||'',messages:state.messages,conditions:state.conditions,discoveryApproved:state.discoveryApproved&&!!this.agents.get(id)!.getInterestAdvertisements(this.now().toISOString()).length,discoveryExpiresAt:state.discoveryExpiresAt,proposal,recheck:p?.status==='evaluating'?this.prompts.get(id)??null:null,revision:state.revision};
 }
 demoView(){return {rows:this.log.rows(),generation:this.generation,scriptRunning:this.scriptRunning,scriptStep:this.scriptStep}}
}
const globalRuntime=globalThis as unknown as {downRuntime?:Runtime};
export const getRuntime=()=>globalRuntime.downRuntime??=new Runtime();

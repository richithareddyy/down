import type { CampusEvent, Cooldown, Proposal, RevealDecision, AttendanceDecision, EventSummary } from './types';
import type { Emit } from '../server/protocol';
export class DomainError extends Error {
 constructor(public code:'STALE_VERSION'|'EXPIRED'|'NOT_ALLOWED'|'INVALID_INPUT'|'INTEREST_LIMIT'|'NOT_FOUND',message:string){super(message)}
}
export const summarize=(event:CampusEvent):EventSummary=>({title:event.title,day:event.day,start:event.start,end:event.end,price:event.price});
const decisions=<T>(members:string[],value:T):Record<string,T>=>Object.fromEntries(members.map(id=>[id,value]));
export class ProposalMachine {
 proposal:Proposal|null=null;
 cooldowns:Cooldown[]=[];
 private suppressed:{eventId:string;members:string[];until:number}[]=[];
 constructor(private emit:Emit,private now:()=>Date,private names:(ids:string[])=>string[],private ttlMs=600000,private cooldownMs=86400000){}
 blocked=(eventId:string,members:string[]):boolean=>this.suppressed.some(s=>s.eventId===eventId&&s.until>this.now().getTime()&&members.every(id=>s.members.includes(id)));
 create(id:string,event:CampusEvent,members:string[]):Proposal {
  this.proposal={id,version:1,eventId:event.id,eventSnapshot:structuredClone(event),memberIds:[...members],status:'awaiting_reveal',createdAt:this.now().toISOString(),expiresAt:new Date(this.now().getTime()+this.ttlMs).toISOString(),revealApprovals:decisions(members,'pending'),attendance:decisions(members,'pending'),interestIds:{},conditionRevisions:{}};
  this.requestReveal();return this.proposal;
 }
 current(id:string,version:number,actor?:string):Proposal {
  this.expire();const p=this.proposal;
  if(!p||p.id!==id)throw new DomainError('NOT_FOUND','proposal not found');
  if(p.version!==version)throw new DomainError('STALE_VERSION','the plan changed. refresh and review it again.');
  if(p.status==='closed')throw new DomainError('EXPIRED','this proposal has closed.');
  if(actor&&!p.memberIds.includes(actor))throw new DomainError('NOT_ALLOWED','you are not part of this proposal');
  return p;
 }
 requestReveal(){const p=this.proposal!;p.status='awaiting_reveal';for(const member of p.memberIds)this.emit('REVEAL_REQUEST','coordinator',member,{proposalId:p.id,version:p.version,eventSummary:summarize(p.eventSnapshot),groupSize:p.memberIds.length})}
 reveal(id:string,version:number,actor:string,decision:RevealDecision){
  const p=this.current(id,version,actor);
  if(p.status!=='awaiting_reveal')throw new DomainError('NOT_ALLOWED','reveal is not awaiting approval');
  if(p.revealApprovals[actor]!=='pending')throw new DomainError('NOT_ALLOWED','your reveal decision is already recorded');
  p.revealApprovals[actor]=decision;
  this.emit('REVEAL_DECISION',actor,'coordinator',{proposalId:id,version,agentId:actor,decision});
  if(decision==='pass'){this.close();return}
  if(p.memberIds.every(member=>p.revealApprovals[member]==='approve')){
   p.status='revealed';
   for(const member of p.memberIds)this.emit('REVEAL','coordinator',member,{proposalId:id,version,memberNames:this.names(p.memberIds)});
   p.status='awaiting_attendance';
   for(const member of p.memberIds)this.emit('ATTEND_REQUEST','coordinator',member,{proposalId:id,version,eventSummary:summarize(p.eventSnapshot),groupSize:p.memberIds.length});
  }
 }
 attend(id:string,version:number,actor:string,decision:AttendanceDecision){
  const p=this.current(id,version,actor);
  if(p.status!=='awaiting_attendance')throw new DomainError('NOT_ALLOWED','attendance is not open');
  if(decision==='out'){this.emit('ATTEND_DECISION',actor,'coordinator',{proposalId:id,version,agentId:actor,decision});this.withdraw(id,version,actor);return}
  p.attendance[actor]=decision;
  this.emit('ATTEND_DECISION',actor,'coordinator',{proposalId:id,version,agentId:actor,decision});
  if(p.memberIds.every(member=>p.attendance[member]==='in'))p.status='confirmed';
 }
 withdraw(id:string,version:number,actor:string){
  const p=this.current(id,version,actor);
  this.emit('WITHDRAW',actor,'coordinator',{proposalId:id,version,agentId:actor});
  this.change(p.memberIds.filter(member=>member!==actor),p.eventSnapshot);
 }
 change(members:string[],event:CampusEvent){
  const p=this.proposal!;
  p.version++;p.memberIds=[...members];p.eventSnapshot=structuredClone(event);p.eventId=event.id;
  p.revealApprovals=decisions(members,'pending');p.attendance=decisions(members,'pending');p.status='evaluating';
  p.expiresAt=new Date(this.now().getTime()+this.ttlMs).toISOString();
  if(!members.length){this.close();return}
  for(const member of members)this.emit('RECHECK','coordinator',member,{proposalId:p.id,newVersion:p.version,groupSize:members.length,memberIds:members});
 }
 close(){
  const p=this.proposal;if(!p||p.status==='closed')return;
  p.status='closed';const until=this.now().getTime()+this.cooldownMs;
  this.cooldowns.push({memberSetHash:[...p.memberIds].sort().join('|'),eventId:p.eventId,until:new Date(until).toISOString()});
  this.suppressed.push({eventId:p.eventId,members:[...p.memberIds],until});
 }
 expire(){if(this.proposal&&this.proposal.status!=='closed'&&this.proposal.status!=='confirmed'&&Date.parse(this.proposal.expiresAt)<=this.now().getTime())this.close()}
}

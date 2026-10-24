import type { AgentState, AgentStore, Student } from '../domain/types';
import { DomainError } from '../domain/proposals';
export function createAgentStore(student:Student):AgentStore {
 const owner=structuredClone(student);
 let state:AgentState={studentId:owner.id,messages:[],conditions:null,discoveryApproved:false,discoveryExpiresAt:null,activeInterestCount:0,interests:[],revision:0};
 return Object.freeze({
  read(...args:unknown[]){if(args.length)throw new DomainError('NOT_ALLOWED','this store is bound to one student');return structuredClone(state)},
  readStudent(){return structuredClone(owner)},
  update(expectedRevision:number,next:AgentState){
   if(next.studentId!==owner.id)throw new DomainError('NOT_ALLOWED','cannot write another student');
   if(state.revision!==expectedRevision)throw new DomainError('STALE_VERSION','your conditions changed. review them again.');
   if(next.interests.length>3)throw new DomainError('INTEREST_LIMIT','you can have up to three active interests');
   if(next.interests.some(i=>i.circleId!==owner.circleId))throw new DomainError('NOT_ALLOWED','discovery must stay inside your circle');
   state=structuredClone({...next,revision:state.revision+1});
  },
 });
}

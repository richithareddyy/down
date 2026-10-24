import {expect,test} from 'vitest';
import {checkConditions} from '../src/domain/constraints';
import {events,students} from '../src/demo/seed';
import type {Conditions,CampusEvent,ReasonCode} from '../src/domain/types';
const check=(c:Conditions,e:CampusEvent=events[0],members=['alex','maya','jay'])=>checkConditions(c,e,members,students[0]);
test.each<[Partial<Conditions>, Partial<CampusEvent>, ReasonCode]>([
 [{activityTags:['music']},{},'ACTIVITY_MISMATCH'],[{days:['sun']},{},'WRONG_DAY'],
 [{maxPrice:7},{},'OVER_BUDGET'],[{endsBefore:'18:00'},{},'ENDS_TOO_LATE'],
 [{beginnerOnly:true},{beginnerFriendly:false},'NOT_BEGINNER'],[{minGroupSize:4},{},'GROUP_TOO_SMALL'],
])('rejects unsatisfied condition %j',(c,e,code)=>{
 expect(check({activityTags:['dance'],...c},{...events[0],...e})).toEqual({verdict:'reject',reasonCode:code});
});
test('all constraints pass with inclusive budget and strictly earlier end',()=>{
 expect(check({activityTags:['dance'],days:['sat'],maxPrice:8,endsBefore:'19:00',beginnerOnly:true,minGroupSize:3,requireApprovedFriend:true})).toEqual({verdict:'accept'});
});
test('approved friend must be present; duplicate members do not inflate count',()=>{
 expect(check({activityTags:['dance'],requireApprovedFriend:true},events[0],['alex','jay'])).toEqual({verdict:'reject',reasonCode:'NO_APPROVED_FRIEND'});
 expect(check({activityTags:['dance'],requireApprovedFriend:true},events[0],['alex','maya'])).toEqual({verdict:'accept'});
 expect(check({activityTags:['dance'],minGroupSize:3},events[0],['alex','maya','maya']).verdict).toBe('reject');
});

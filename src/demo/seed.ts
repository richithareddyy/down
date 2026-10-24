import type { CampusEvent, Circle, Student, Conditions } from '../domain/types';
export const students: Student[] = [
 {id:'alex',name:'Alex',circleId:'campus',approvedFriendIds:['maya']},
 {id:'maya',name:'Maya',circleId:'campus',approvedFriendIds:['alex','jay','dev']},
 {id:'jay',name:'Jay',circleId:'campus',approvedFriendIds:['alex','maya','dev']},
 {id:'dev',name:'Dev',circleId:'campus',approvedFriendIds:['alex','maya','jay']},
];
export const circle: Circle = {id:'campus',name:'campus friends',memberIds:students.map(s=>s.id)};
export const events: CampusEvent[] = [
 {id:'dance',title:'beginner dance workshop',activityTags:['dance'],beginnerFriendly:true,day:'sat',start:'17:00',end:'18:00',price:8},
 {id:'mic',title:'open mic night',activityTags:['music','open mic'],beginnerFriendly:true,day:'fri',start:'20:00',end:'22:00',price:5},
 {id:'climbing',title:'intro to climbing',activityTags:['climbing'],beginnerFriendly:true,day:'sun',start:'14:00',end:'16:00',price:20},
];
export const seedMessages: Record<string,string> = {
 alex:'Beginner dance sounds fun, but only with someone I know.',
 maya:"I'm down if it's beginner-friendly and under $10.",
 jay:'Only if at least three of us go, and it ends before seven.',
 dev:'Interested in dance, but only on Sunday.',
};
export const seedConditions: Record<string,Conditions> = {
 alex:{activityTags:['dance'],requireApprovedFriend:true,beginnerOnly:true},
 maya:{activityTags:['dance'],beginnerOnly:true,maxPrice:10},
 jay:{activityTags:['dance'],minGroupSize:3,endsBefore:'19:00'},
 dev:{activityTags:['dance'],days:['sun']},
};

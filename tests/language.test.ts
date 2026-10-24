import {expect,test,vi} from 'vitest';
import {RequestLanguage} from '../src/agents/language';
import {seedMessages,seedConditions} from '../src/demo/seed';
const unavailable=vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
test('each seed request has an exact fallback with explicit activity context',async()=>{
 const language=new RequestLanguage('test',unavailable);
 for(const [id,message] of Object.entries(seedMessages))expect(await language.parse(`For beginner dance: ${message}`,null)).toMatchObject({kind:'parsed',conditions:seedConditions[id]});
 expect((await language.parse(seedMessages.maya,null)).kind).toBe('clarify');
 expect((await language.parse('maybe something sometime',null)).kind).toBe('clarify');
});
test('malformed and refused outputs never become conditions',async()=>{
 for(const body of [{stop_reason:'end_turn',content:[{type:'text',text:'{"kind":"parsed","conditions":{"activityTags":["dance"],"maxPrice":-5},"question":""}'}]},{stop_reason:'refusal',content:[]}]){
  const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
  expect((await new RequestLanguage('test',mock).parse('something unrecognized',null)).kind).toBe('clarify');
 }
});
test('language service receives only this student context and uses structured output',async()=>{
 const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({kind:'parsed',conditions:{activityTags:['dance'],maxPrice:10},question:''})}]}));
 const result=await new RequestLanguage('test',mock).parse('dance under $10',null);expect(result.kind).toBe('parsed');
 const body=JSON.parse(mock.mock.calls[0][1]!.body as string);expect(body.output_config.format.type).toBe('json_schema');expect(JSON.parse(body.messages[0].content)).toEqual({text:'dance under $10',ownConditions:null});expect(JSON.stringify(body)).not.toMatch(/memberIds|approvedFriendIds/);
});

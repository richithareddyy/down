import { getRuntime } from '../../../src/server/runtime';
import { failure,sameOrigin } from '../../../src/server/http';
import { DomainError } from '../../../src/domain/proposals';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){return Response.json(getRuntime().demoView(),{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){try{sameOrigin(request);const body=await request.json(),r=getRuntime();if(body.type==='reset')r.reset();else if(body.type==='discover')r.discover();else if(body.type==='withdraw_alex'){const p=r.machine.proposal;if(!p)throw new DomainError('NOT_FOUND','there is no active proposal');await r.command('alex',{type:'withdraw',proposalId:p.id,version:p.version})}else throw new DomainError('INVALID_INPUT','unknown demo action');return Response.json({ok:true,data:r.demoView()})}catch(e){return failure(e)}}

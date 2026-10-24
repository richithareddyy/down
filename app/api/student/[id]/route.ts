import { getRuntime } from '../../../../src/server/runtime';
import { commandSchema } from '../../../../src/domain/schemas';
import { failure, sameOrigin } from '../../../../src/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){try{return Response.json({ok:true,data:getRuntime().view((await params).id)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(request:Request,{params}:Context){try{sameOrigin(request);const command=commandSchema.parse(await request.json());return Response.json({ok:true,data:await getRuntime().command((await params).id,command)})}catch(e){return failure(e)}}

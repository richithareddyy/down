import { getRuntime } from '../../../../../src/server/runtime';
import { stream } from '../../../../../src/server/streams';
import { failure } from '../../../../../src/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id,r=getRuntime();r.view(id);return stream(r,()=>({type:'snapshot',data:r.view(id)}),request.signal)}catch(e){return failure(e)}}

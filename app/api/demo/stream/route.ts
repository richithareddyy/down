import { getRuntime } from '../../../../src/server/runtime';
import { stream } from '../../../../src/server/streams';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){const r=getRuntime();return stream(r,()=>r.demoView(),request.signal)}

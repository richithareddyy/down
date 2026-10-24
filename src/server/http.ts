import { DomainError } from '../domain/proposals';
export function failure(error:unknown){
 if(error instanceof DomainError)return Response.json({ok:false,code:error.code,message:error.message},{status:error.code==='NOT_FOUND'?404:error.code==='STALE_VERSION'?409:400});
 return Response.json({ok:false,code:'INVALID_INPUT',message:'could not process that request. please try again.'},{status:400});
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new DomainError('NOT_ALLOWED','cross-origin changes are not allowed')}

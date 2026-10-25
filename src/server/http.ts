/** True when a browser request comes from this site (or isn't from a browser page at all). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const target = new URL(request.url);
  const host = request.headers.get("host") ?? target.host;
  const from = new URL(origin);
  return from.host === host && from.protocol === target.protocol;
}

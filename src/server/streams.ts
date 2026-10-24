import type { Runtime } from "./runtime";
export function stream(
  runtime: Runtime,
  snapshot: () => unknown,
  signal: AbortSignal,
) {
  let cleanup = () => {};
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot())}\n\n`),
          );
        } catch {
          cleanup();
        }
      };
      const unsub = runtime.subscribe(send);
      const timer = setInterval(send, 2000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsub();
        signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {}
      };
      signal.addEventListener("abort", cleanup, { once: true });
      if (signal.aborted) cleanup();
      else send();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

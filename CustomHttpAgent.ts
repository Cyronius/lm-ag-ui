import { HttpAgent, RunAgentInput, BaseEvent, transformHttpEventStream } from '@ag-ui/client';
import type { HttpAgentConfig } from '@ag-ui/client';
import { Observable, defer, from, switchMap, throwError } from 'rxjs';

export type RequestHandler = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

type HttpEvent =
    | { type: 'headers'; status: number; headers: Headers }
    | { type: 'data'; data: Uint8Array };

/**
 * Subclass of HttpAgent that routes HTTP requests through a custom handler
 * instead of the global fetch. This allows consumers to inject their own
 * request pipeline (e.g., SessionManager with retries/resilience).
 */
export class CustomHttpAgent extends HttpAgent {
    private _handler: RequestHandler;

    constructor(config: HttpAgentConfig, handler: RequestHandler) {
        super(config);
        this._handler = handler;
    }

    run(input: RunAgentInput): Observable<BaseEvent> {
        const init = this.requestInit(input);
        // Cast through unknown to bridge the dual-rxjs type gap:
        // @ag-ui/client bundles its own rxjs copy whose Observable type is
        // structurally identical but nominally different from the project's rxjs.
        const source$ = runHttpRequestWithHandler(this.url, init, this._handler);
        return transformHttpEventStream(source$ as any);
    }
}

/**
 * Mirrors @ag-ui/client's internal runHttpRequest but uses a custom handler
 * instead of the global fetch. Emits HttpEvent-compatible objects (HEADERS then DATA chunks).
 */
function runHttpRequestWithHandler(
    url: string,
    requestInit: RequestInit,
    handler: RequestHandler
): Observable<HttpEvent> {
    return defer(() => from(handler(url, requestInit))).pipe(
        switchMap(response => {
            if (!response.ok) {
                const contentType = response.headers.get('content-type') || '';
                return from(response.text()).pipe(
                    switchMap(text => {
                        let payload: any = text;
                        if (contentType.includes('application/json')) {
                            try { payload = JSON.parse(text); } catch { /* keep as text */ }
                        }
                        const error: any = new Error(
                            `HTTP ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
                        );
                        error.status = response.status;
                        error.payload = payload;
                        return throwError(() => error);
                    })
                );
            }

            const headersEvent: HttpEvent = {
                type: 'headers' as const,
                status: response.status,
                headers: response.headers
            };

            const reader = response.body?.getReader();
            if (!reader) {
                return throwError(() => new Error('Failed to getReader() from response'));
            }

            return new Observable<HttpEvent>(subscriber => {
                subscriber.next(headersEvent);

                (async () => {
                    try {
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            subscriber.next({ type: 'data' as const, data: value });
                        }
                        subscriber.complete();
                    } catch (err) {
                        subscriber.error(err);
                    }
                })();

                return () => {
                    reader.cancel().catch((e: any) => {
                        if (e?.name !== 'AbortError') throw e;
                    });
                };
            });
        })
    );
}

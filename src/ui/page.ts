// What every page does the same way: wait for the bridge, and show a failure
// as a sentence where the user is looking. The page is in a sandboxed frame,
// so a console message is one nobody reads.

import { el, replace } from './dom.js';

/** Shows a failure where the user is looking, as a sentence. */
export function fail(host: HTMLElement, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    replace(
        host,
        el('div', { class: 'failure' }, el('strong', {}, 'That did not work. '), el('span', {}, message)),
    );
}

/** Runs a page's body once the bridge is ready, and shows anything that goes wrong. */
export function start(hostId: string, body: (ctx: K8sDockside.Context) => Promise<void>): void {
    const run = async () => {
        const host = document.getElementById(hostId);
        try {
            const ctx = await k8sdockside.ready();
            await body(ctx);
        } catch (err) {
            if (host) fail(host, err);
        }
    };
    void run();
}

// @vitest-environment happy-dom
//
// Does the panel actually draw, and does the context box do what it says?
//
// The model tests say the commands are right; this runs the page module
// against a stub of the bridge, with no cluster and no app, and reads what
// comes out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deployment, pod, service } from '../fixtures.js';

const CONTEXT_ID = '/Users/me/.kube/config::kind-demo';

let stored: Record<string, unknown> = {};
let sections: string[] = [];

/** The bridge's ui.section, as plain elements: a heading and a body. */
function section(opts: K8sDockside.SectionOptions): K8sDockside.Section {
    sections.push(opts.title);
    const root = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = opts.title;
    const actions = document.createElement('div');
    const body = document.createElement('div');
    root.append(title, actions, body);
    opts.parent?.append(root);
    return {
        root,
        body,
        actions,
        setTitle: (text) => void (title.textContent = text),
        setCount: () => {},
        isFolded: () => false,
        setFolded: () => {},
        onToggle: () => () => {},
    };
}

function bridge(object: K8sDockside.KubeObject | null, ref: K8sDockside.SectionObject | null) {
    return {
        ready: async () => ({
            pluginId: 'kubectl-panel',
            viewId: '',
            sectionId: ref ? 'x-kubectl' : '',
            object: ref,
            contextId: CONTEXT_ID,
            contextName: 'My demo cluster',
            readable: [],
            write: false,
            theme: { id: 'k8sdockside-dark', base: 'dark' as const, tokens: {} },
        }),
        object: async () => object,
        storage: {
            get: async (key: string) => stored[key] ?? null,
            set: async (key: string, value: unknown) => void (stored[key] = value),
            remove: async () => null,
            keys: async () => Object.keys(stored),
        },
        on: () => () => {},
        ui: { section },
    };
}

/** Runs the page module fresh, then lets its promises settle. */
async function run(): Promise<void> {
    vi.resetModules();
    await import('./kubectl.js');
    for (let i = 0; i < 25; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
}

function shown(): string[] {
    return [...document.querySelectorAll('code.line')].map((n) => n.textContent ?? '');
}

beforeEach(() => {
    stored = {};
    sections = [];
    document.body.innerHTML = '<div id="page"><div id="panel"></div></div>';
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('the panel', () => {
    it('draws a Deployment’s commands in three sections, naming the kubeconfig context, not the alias', async () => {
        vi.stubGlobal('k8sdockside', bridge(deployment, { kind: 'deployments', namespace: 'shop', name: 'web' }));
        await run();

        expect(sections).toEqual(['Look', 'Logs, shells and ports', 'Change']);
        expect(shown()).toContain('kubectl --context kind-demo -n shop rollout restart deploy/web');
        expect(document.body.textContent).not.toContain('My demo cluster');
        expect(document.querySelectorAll('button.copy').length).toBe(shown().length);
    });

    it('draws a Pod’s and a Service’s', async () => {
        vi.stubGlobal('k8sdockside', bridge(pod, { kind: 'pods', namespace: 'shop', name: pod.metadata.name }));
        await run();
        expect(shown()).toContain('kubectl --context kind-demo -n shop logs -f web-7d4f9-2xk11');

        document.body.innerHTML = '<div id="page"><div id="panel"></div></div>';
        vi.stubGlobal('k8sdockside', bridge(service, { kind: 'services', namespace: 'shop', name: 'web' }));
        await run();
        expect(shown()).toContain('kubectl --context kind-demo -n shop port-forward svc/web 8080:80');
    });

    it('drops --context from every line when the box is unticked, and remembers it', async () => {
        vi.stubGlobal('k8sdockside', bridge(deployment, { kind: 'deployments', namespace: 'shop', name: 'web' }));
        await run();

        const box = document.querySelector<HTMLInputElement>('#name-context')!;
        expect(box.checked).toBe(true);
        box.checked = false;
        box.dispatchEvent(new Event('change'));
        await Promise.resolve();

        expect(shown().length).toBeGreaterThan(0);
        expect(shown().every((l) => !l.includes('--context'))).toBe(true);
        expect(shown()).toContain('kubectl -n shop rollout restart deploy/web');
        expect(stored['name-context']).toBe(false);

        // Drawn again, as when the detail view moves to another object.
        document.body.innerHTML = '<div id="page"><div id="panel"></div></div>';
        await run();
        expect(document.querySelector<HTMLInputElement>('#name-context')!.checked).toBe(false);
        expect(shown()).toContain('kubectl -n shop rollout restart deploy/web');
    });

    it('selects the line and says how to copy it when the clipboard is refused', async () => {
        vi.stubGlobal('k8sdockside', bridge(deployment, { kind: 'deployments', namespace: 'shop', name: 'web' }));
        vi.stubGlobal('navigator', { ...navigator, userAgent: 'Macintosh', clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
        document.execCommand = () => false;
        await run();

        document.querySelector<HTMLButtonElement>('button.copy')!.click();
        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(document.querySelector('[role="status"]')!.textContent).toContain('press ⌘C');
        expect(window.getSelection()?.toString()).toBe(shown()[0]);
    });

    it('shows a tick when the copy worked, and copies exactly the line shown', async () => {
        const copied: string[] = [];
        vi.stubGlobal('k8sdockside', bridge(deployment, { kind: 'deployments', namespace: 'shop', name: 'web' }));
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => void copied.push(t) } });
        await run();

        const button = document.querySelector<HTMLButtonElement>('button.copy')!;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(copied).toEqual([shown()[0]]);
        expect(button.classList.contains('copied')).toBe(true);
    });

    it('says what it is for when opened anywhere but a panel', async () => {
        vi.stubGlobal('k8sdockside', bridge(null, null));
        await run();
        expect(document.body.textContent).toContain('open a Pod, Deployment or Service');
    });

    it('shows a failure as a sentence', async () => {
        const failing = { ...bridge(null, { kind: 'pods', namespace: 'shop', name: 'gone' }), object: async () => Promise.reject(new Error('pods "gone" not found')) };
        vi.stubGlobal('k8sdockside', failing);
        await run();
        expect(document.body.textContent).toContain('pods "gone" not found');
    });
});

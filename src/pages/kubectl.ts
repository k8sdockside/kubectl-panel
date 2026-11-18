// The panel: the kubectl commands for the Pod, Deployment or Service it is
// drawn for.
//
// One page serves all three kinds. The manifest declares a section per kind,
// each with this page as its entry, and `ready()` says which kind and object
// this copy is drawn for. The commands come from src/model/commands.ts; this
// file only puts them on the screen.
//
// Every line carries `--context <name>` by default. The app can have a dozen
// clusters open, and the user's shell is pointed at whichever one they last
// switched to -- a `rollout restart` copied from the production tab and run
// against staging, or the other way round, is the mistake this panel must not
// make easy. The box at the top drops the flag for people who keep their
// shell in step; the choice is remembered for the plugin on this cluster.

import { byId, button, el, replace, svg } from '../ui/dom.js';
import { start, fail } from '../ui/page.js';
import { copyText, selectText } from '../ui/copy.js';
import { COPY, TICK } from '../ui/icons.js';
import { commandsFor, contextFromId, render, type Command, type Target } from '../model/commands.js';
import { commandLine } from '../model/shell.js';
import { isPanelKind } from '../model/kube.js';

const NAME_CONTEXT_KEY = 'name-context';

/** How long a copy button shows its tick. */
const COPIED_MS = 1500;

start('page', async (ctx) => {
    const host = byId('panel');

    if (!ctx.object || !isPanelKind(ctx.object.kind)) {
        replace(host, el('p', { class: 'empty' }, 'This page is a panel; open a Pod, Deployment or Service.'));
        return;
    }
    const kind = ctx.object.kind;
    const namespace = ctx.object.namespace;
    const context = contextFromId(ctx.contextId);

    try {
        // Read live rather than trusting ready(): the replica count and the
        // paused flag change which lines are offered.
        const object = await k8sdockside.object();
        let nameContext = await readNameContext();

        const target = (): Target => ({ namespace, context: nameContext ? context : '' });

        // Each line on the page, with the command it shows, so the context
        // box can rewrite them all in place without redrawing the sections
        // (and losing their folds).
        const lines: { node: HTMLElement; command: Command }[] = [];
        const status = el('p', { class: 'hint', role: 'status' });

        replace(host);
        if (context) host.append(contextBox());

        for (const group of commandsFor(kind, object)) {
            const section = k8sdockside.ui!.section({
                id: group.id,
                title: group.title,
                count: group.commands.length,
                what: `the ${group.title.toLowerCase()} commands`,
                parent: host,
            });
            section.body.append(...group.commands.map(row));
        }
        host.append(status);

        function row(command: Command): HTMLElement {
            const line = el('code', { class: 'line' }, render(command, target()));
            lines.push({ node: line, command });

            const copy = button('', () => void copyLine(line, copy), {
                class: 'copy',
                title: 'Copy',
                'aria-label': 'Copy the command',
            });
            copy.append(svg(COPY, 'icon'));

            return el('div', { class: 'cmd' }, line, copy, el('div', { class: 'what' }, command.what));
        }

        async function copyLine(line: HTMLElement, copy: HTMLButtonElement): Promise<void> {
            const text = line.textContent ?? '';
            if (await copyText(text)) {
                status.textContent = '';
                replace(copy, svg(TICK, 'icon'));
                copy.classList.add('copied');
                setTimeout(() => {
                    replace(copy, svg(COPY, 'icon'));
                    copy.classList.remove('copied');
                }, COPIED_MS);
                return;
            }
            // The clipboard was refused inside the sandbox. Selecting the line
            // leaves the user one keystroke from having it anyway.
            selectText(line);
            const keys = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C';
            status.textContent = `The clipboard is not available here, so the line is selected: press ${keys} to copy it.`;
        }

        function contextBox(): HTMLElement {
            const box = el('input', { type: 'checkbox', id: 'name-context' });
            box.checked = nameContext;
            box.addEventListener('change', () => {
                nameContext = box.checked;
                for (const { node, command } of lines) node.textContent = render(command, target());
                void saveNameContext(nameContext);
            });
            return el(
                'label',
                { class: 'context', for: 'name-context' },
                box,
                el('span', {}, 'Name the cluster on every line: '),
                el('code', {}, commandLine(['--context', context])),
            );
        }
    } catch (err) {
        fail(host, err);
    }
});

/** Whether to put `--context` on every line. On unless the user said otherwise. */
async function readNameContext(): Promise<boolean> {
    try {
        const saved = await k8sdockside.storage?.get<boolean>(NAME_CONTEXT_KEY);
        return saved !== false;
    } catch {
        return true;
    }
}

async function saveNameContext(value: boolean): Promise<void> {
    try {
        await k8sdockside.storage?.set(NAME_CONTEXT_KEY, value);
    } catch {
        // Not remembered, then; the box still works for this panel.
    }
}

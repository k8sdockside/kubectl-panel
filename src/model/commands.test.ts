import { describe, expect, test } from 'vitest';
import { commandsFor, contextFromId, localPort, render, type Group, type Target } from './commands.js';
import { deployment, pod, service, sidecarPod } from '../fixtures.js';
import type { Deployment, Service } from './kube.js';

const SHOP: Target = { namespace: 'shop', context: '' };

/** Every line of every group, written out for a target. */
function lines(groups: Group[], target: Target = SHOP): string[] {
    return groups.flatMap((g) => g.commands.map((c) => render(c, target)));
}

describe('render', () => {
    test('puts the context and namespace before the subcommand', () => {
        const cmd = { args: ['get', 'pods'], what: '' };
        expect(render(cmd, { namespace: 'shop', context: 'kind-demo' })).toBe('kubectl --context kind-demo -n shop get pods');
        expect(render(cmd, { namespace: 'shop', context: '' })).toBe('kubectl -n shop get pods');
        expect(render(cmd, { namespace: '', context: '' })).toBe('kubectl get pods');
    });

    test('quotes a context name a shell would split', () => {
        const cmd = { args: ['get', 'pods'], what: '' };
        expect(render(cmd, { namespace: 'shop', context: 'my laptop' })).toBe("kubectl --context 'my laptop' -n shop get pods");
    });
});

describe('contextFromId', () => {
    test('takes the context name from after the kubeconfig path', () => {
        expect(contextFromId('/Users/me/.kube/config::kind-demo')).toBe('kind-demo');
        expect(contextFromId('/k/config::arn:aws:eks:eu-north-1:1:cluster/prod')).toBe('arn:aws:eks:eu-north-1:1:cluster/prod');
    });

    test('an id with no path is the name itself', () => {
        expect(contextFromId('in-cluster')).toBe('in-cluster');
    });
});

describe('localPort', () => {
    test('moves privileged ports up by 8000 and leaves the rest', () => {
        expect(localPort(80)).toBe(8080);
        expect(localPort(443)).toBe(8443);
        expect(localPort(1023)).toBe(9023);
        expect(localPort(1024)).toBe(1024);
        expect(localPort(5432)).toBe(5432);
    });
});

describe('deployments', () => {
    test('has the lines on the slide, word for word', () => {
        const all = lines(commandsFor('deployments', deployment));
        expect(all).toContain('kubectl -n shop get deploy web -o yaml');
        expect(all).toContain('kubectl -n shop describe deploy web');
        expect(all).toContain('kubectl -n shop rollout restart deploy/web');
        expect(all).toContain('kubectl -n shop logs -f deploy/web');
    });

    test('scales to the count it has now, and finds its Pods by its selector', () => {
        const all = lines(commandsFor('deployments', deployment));
        expect(all).toContain('kubectl -n shop scale deploy/web --replicas=3');
        expect(all).toContain('kubectl -n shop get pods -l app=web');
    });

    test('an absent replicas field is one, the API default', () => {
        const bare: Deployment = { ...deployment, spec: { ...deployment.spec, replicas: undefined } };
        expect(lines(commandsFor('deployments', bare))).toContain('kubectl -n shop scale deploy/web --replicas=1');
    });

    test('forwards the TCP ports its containers declare, never the UDP ones', () => {
        const all = lines(commandsFor('deployments', deployment));
        expect(all).toContain('kubectl -n shop port-forward deploy/web 8080:8080');
        expect(all).toContain('kubectl -n shop port-forward deploy/web 9090:9090');
        expect(all.some((l) => l.includes('5353'))).toBe(false);
    });

    test('offers pause on a running rollout and resume on a paused one', () => {
        const running = lines(commandsFor('deployments', deployment));
        expect(running).toContain('kubectl -n shop rollout pause deploy/web');
        expect(running.some((l) => l.includes('rollout resume'))).toBe(false);

        const paused: Deployment = { ...deployment, spec: { ...deployment.spec, paused: true } };
        const resumed = lines(commandsFor('deployments', paused));
        expect(resumed).toContain('kubectl -n shop rollout resume deploy/web');
        expect(resumed.some((l) => l.includes('rollout pause'))).toBe(false);
    });

    test('quotes a set-based selector', () => {
        const fancy: Deployment = {
            ...deployment,
            spec: {
                ...deployment.spec,
                selector: { matchExpressions: [{ key: 'tier', operator: 'In', values: ['web', 'api'] }] },
            },
        };
        expect(lines(commandsFor('deployments', fancy))).toContain("kubectl -n shop get pods -l 'tier in (api,web)'");
    });

    test('groups in the order look, into, change', () => {
        expect(commandsFor('deployments', deployment).map((g) => g.id)).toEqual(['look', 'into', 'change']);
    });
});

describe('pods', () => {
    test('looks, follows the logs, and opens a shell without naming the only container', () => {
        const all = lines(commandsFor('pods', pod));
        expect(all).toContain('kubectl -n shop get pod web-7d4f9-2xk11 -o yaml');
        expect(all).toContain('kubectl -n shop describe pod web-7d4f9-2xk11');
        expect(all).toContain('kubectl -n shop events --for pod/web-7d4f9-2xk11');
        expect(all).toContain('kubectl -n shop logs -f web-7d4f9-2xk11');
        expect(all).toContain('kubectl -n shop exec -it web-7d4f9-2xk11 -- sh');
        expect(all.some((l) => l.includes(' -c '))).toBe(false);
    });

    test('offers the previous logs only when the container has restarted', () => {
        expect(lines(commandsFor('pods', pod))).toContain('kubectl -n shop logs web-7d4f9-2xk11 --previous');

        const fresh = { ...pod, status: { containerStatuses: [{ name: 'web', restartCount: 0 }] } };
        expect(lines(commandsFor('pods', fresh)).some((l) => l.includes('--previous'))).toBe(false);
    });

    test('forwards a privileged port to a local one above 1024', () => {
        expect(lines(commandsFor('pods', pod))).toContain('kubectl -n shop port-forward pod/web-7d4f9-2xk11 8080:80');
    });

    test('says who will replace it, or that nothing will', () => {
        const owned = commandsFor('pods', pod).find((g) => g.id === 'change')!.commands[0]!;
        expect(owned.what).toContain('ReplicaSet');

        const orphan = commandsFor('pods', sidecarPod).find((g) => g.id === 'change')!.commands[0]!;
        expect(orphan.what).toContain('nothing will recreate it');
    });

    describe('with several containers', () => {
        test('names the annotated default container, as kubectl itself would pick', () => {
            const all = lines(commandsFor('pods', sidecarPod));
            expect(all).toContain('kubectl -n shop logs -f debug -c app');
            expect(all).toContain('kubectl -n shop exec -it debug -c app -- sh');
            expect(all).toContain('kubectl -n shop logs -f debug --all-containers --prefix');
        });

        test('reads restarts for the container it names, not for another one', () => {
            // The proxy restarted, the app did not: `logs --previous -c app` would fail.
            expect(lines(commandsFor('pods', sidecarPod)).some((l) => l.includes('--previous'))).toBe(false);
        });

        test('without the annotation, picks the first container', () => {
            const plain = { ...sidecarPod, metadata: { ...sidecarPod.metadata, annotations: {} } };
            const all = lines(commandsFor('pods', plain));
            expect(all).toContain('kubectl -n shop logs -f debug -c proxy');
            expect(all).toContain('kubectl -n shop logs debug -c proxy --previous');
        });

        test('an annotation naming no container is ignored', () => {
            const wrong = {
                ...sidecarPod,
                metadata: { ...sidecarPod.metadata, annotations: { 'kubectl.kubernetes.io/default-container': 'gone' } },
            };
            expect(lines(commandsFor('pods', wrong))).toContain('kubectl -n shop logs -f debug -c proxy');
        });
    });
});

describe('services', () => {
    test('has the port-forward on the slide, word for word', () => {
        expect(lines(commandsFor('services', service))).toContain('kubectl -n shop port-forward svc/web 8080:80');
    });

    test('forwards each TCP port, a protocol left out being TCP', () => {
        const all = lines(commandsFor('services', service));
        expect(all).toContain('kubectl -n shop port-forward svc/web 8443:443');
        expect(all.some((l) => l.includes(':53'))).toBe(false);
    });

    test('finds its endpoints and its Pods', () => {
        const all = lines(commandsFor('services', service));
        expect(all).toContain('kubectl -n shop get endpointslices -l kubernetes.io/service-name=web');
        expect(all).toContain('kubectl -n shop get pods -l app=web');
    });

    test('offers no port-forward kubectl would refuse', () => {
        const external: Service = { ...service, spec: { ...service.spec, type: 'ExternalName' } };
        const manual: Service = { ...service, spec: { ...service.spec, selector: undefined } };
        for (const svc of [external, manual]) {
            const groups = commandsFor('services', svc);
            expect(lines(groups).some((l) => l.includes('port-forward'))).toBe(false);
            // ...and no empty heading where the ports would have been.
            expect(groups.map((g) => g.id)).toEqual(['look', 'change']);
        }
        // Without a selector there is no "Pods behind it" line either.
        expect(lines(commandsFor('services', manual)).some((l) => l.includes('get pods'))).toBe(false);
    });
});

describe('every line', () => {
    test('starts with kubectl and its target, for every kind', () => {
        const target = { namespace: 'shop', context: 'kind-demo' };
        for (const [kind, obj] of [
            ['pods', pod],
            ['pods', sidecarPod],
            ['deployments', deployment],
            ['services', service],
        ] as const) {
            for (const line of lines(commandsFor(kind, obj), target)) {
                expect(line.startsWith('kubectl --context kind-demo -n shop ')).toBe(true);
            }
        }
    });

    test('has a description', () => {
        for (const group of [...commandsFor('pods', pod), ...commandsFor('deployments', deployment), ...commandsFor('services', service)]) {
            for (const command of group.commands) expect(command.what.length).toBeGreaterThan(0);
        }
    });
});

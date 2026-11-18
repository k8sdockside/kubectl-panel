// Objects shaped the way the API server returns them, for the tests. Only
// the fields the plugin reads are filled in, plus enough metadata to be real.

import type { Deployment, Pod, Service } from './model/kube.js';

export const deployment: Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web', namespace: 'shop', uid: 'd-1' },
    spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'web' } },
        template: {
            spec: {
                containers: [
                    {
                        name: 'web',
                        ports: [
                            { containerPort: 8080, protocol: 'TCP' },
                            { containerPort: 9090, name: 'metrics' },
                            { containerPort: 5353, protocol: 'UDP' },
                        ],
                    },
                ],
            },
        },
    },
};

/** One container, owned by a ReplicaSet, restarted twice. */
export const pod: Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
        name: 'web-7d4f9-2xk11',
        namespace: 'shop',
        uid: 'p-1',
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-7d4f9', uid: 'rs-1', controller: true }],
    },
    spec: { containers: [{ name: 'web', ports: [{ containerPort: 80 }] }] },
    status: { containerStatuses: [{ name: 'web', restartCount: 2 }] },
};

/** Two containers, the second annotated as the default, owned by nothing. */
export const sidecarPod: Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
        name: 'debug',
        namespace: 'shop',
        uid: 'p-2',
        annotations: { 'kubectl.kubernetes.io/default-container': 'app' },
    },
    spec: { containers: [{ name: 'proxy' }, { name: 'app' }] },
    status: {
        containerStatuses: [
            { name: 'proxy', restartCount: 4 },
            { name: 'app', restartCount: 0 },
        ],
    },
};

export const service: Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'web', namespace: 'shop', uid: 's-1' },
    spec: {
        type: 'ClusterIP',
        selector: { app: 'web' },
        ports: [
            { name: 'http', port: 80, protocol: 'TCP' },
            { name: 'https', port: 443 },
            { name: 'dns', port: 53, protocol: 'UDP' },
        ],
    },
};

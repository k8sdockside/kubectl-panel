// The slices of Pods, Deployments and Services this plugin reads.
//
// The bridge types every object as K8sDockside.KubeObject, whose `spec` and
// `status` are `unknown`. Only the fields that change which commands are
// listed are declared here; everything else is still on the object at runtime,
// just not typed.

/** The kinds this plugin draws a panel for. */
export type PanelKind = 'pods' | 'deployments' | 'services';

export const PANEL_KINDS: readonly PanelKind[] = ['pods', 'deployments', 'services'];

export function isPanelKind(kind: string): kind is PanelKind {
    return (PANEL_KINDS as readonly string[]).includes(kind);
}

export interface ContainerPort {
    containerPort?: number;
    protocol?: string;
    name?: string;
}

export interface Container {
    name: string;
    ports?: ContainerPort[];
}

export interface PodSpec {
    containers?: Container[];
}

export interface Pod extends K8sDockside.KubeObject {
    spec?: PodSpec;
    status?: {
        containerStatuses?: { name: string; restartCount?: number }[];
    };
}

export interface LabelSelectorRequirement {
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | string;
    values?: string[];
}

export interface LabelSelector {
    matchLabels?: Record<string, string>;
    matchExpressions?: LabelSelectorRequirement[];
}

export interface Deployment extends K8sDockside.KubeObject {
    spec?: {
        replicas?: number;
        paused?: boolean;
        selector?: LabelSelector;
        template?: { spec?: PodSpec };
    };
}

export interface ServicePort {
    port?: number;
    protocol?: string;
    name?: string;
}

export interface Service extends K8sDockside.KubeObject {
    spec?: {
        type?: string;
        selector?: Record<string, string>;
        ports?: ServicePort[];
    };
}

/** The controller that owns an object, if one does. */
export function controllerOf(obj: K8sDockside.KubeObject): K8sDockside.OwnerReference | undefined {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
}

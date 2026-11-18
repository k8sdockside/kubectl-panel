// The kubectl commands for one object.
//
// Each kind gets the commands someone actually types for it, in three groups:
// looking at it, getting into it (logs, a shell, a port), and changing it. The
// object itself decides the details -- which container, which ports, how many
// replicas, whether the rollout is paused -- so the lines can be pasted as they
// are rather than edited first.
//
// A command is kept as its words, not as a string: the namespace and context
// flags are added when it is written out, and every word is quoted then, so
// nothing here has to think about shells.

import { commandLine } from './shell.js';
import { mapSelectorString, selectorString } from './selector.js';
import { controllerOf, type Container, type Deployment, type PanelKind, type Pod, type Service } from './kube.js';

export interface Command {
    /** The words after `kubectl` and its namespace and context flags. */
    args: string[];
    /** What it does, in a few words. */
    what: string;
}

export interface Group {
    /** What the app remembers the group's fold by. Stable; never shown. */
    id: 'look' | 'into' | 'change';
    title: string;
    commands: Command[];
}

/** Where a command runs: the flags that come before the subcommand. */
export interface Target {
    namespace: string;
    /** A kubeconfig context name, or `''` to use the shell's current one. */
    context: string;
}

/** At most this many port-forward lines per object; a list of twelve is noise. */
const MAX_PORTS = 3;

/** The annotation `kubectl logs` and `kubectl exec` themselves read for the default container. */
const DEFAULT_CONTAINER = 'kubectl.kubernetes.io/default-container';

/** The full line, as it is pasted into a shell. */
export function render(command: Command, target: Target): string {
    const words = ['kubectl'];
    if (target.context) words.push('--context', target.context);
    if (target.namespace) words.push('-n', target.namespace);
    return commandLine([...words, ...command.args]);
}

/**
 * The kubeconfig context name inside the app's context id.
 *
 * The app knows a context as `<kubeconfig path>::<context name>`, because
 * names are only unique within one file. `contextName` from `ready()` is no use
 * here: it is the user's alias for the context when they have given it one,
 * which kubectl has never heard of.
 */
export function contextFromId(contextId: string): string {
    const at = contextId.indexOf('::');
    return at < 0 ? contextId : contextId.slice(at + 2);
}

/**
 * A local port for a port-forward. Ports under 1024 need root to listen on,
 * so they are moved up by 8000 -- 80 to 8080, 443 to 8443, the numbers people
 * reach for anyway. Anything else is forwarded to the same number.
 */
export function localPort(remote: number): number {
    return remote < 1024 ? remote + 8000 : remote;
}

export function commandsFor(kind: PanelKind, object: K8sDockside.KubeObject): Group[] {
    const groups =
        kind === 'pods'
            ? podCommands(object as Pod)
            : kind === 'deployments'
              ? deploymentCommands(object as Deployment)
              : serviceCommands(object as Service);
    // A group with nothing in it would be a heading over a gap.
    return groups.filter((group) => group.commands.length > 0);
}

// ----- Pods ----------------------------------------------------------------

function podCommands(pod: Pod): Group[] {
    const name = pod.metadata.name;
    const containers = pod.spec?.containers ?? [];
    const several = containers.length > 1;
    const main = defaultContainer(pod, containers);
    // `-c` only when it changes anything: with one container it is noise.
    const pick = several && main ? ['-c', main] : [];
    const restarted = (pod.status?.containerStatuses ?? []).find(
        (status) => status.name === main && (status.restartCount ?? 0) > 0,
    );

    const into: Command[] = [
        {
            args: ['logs', '-f', name, ...pick],
            what: several ? `Follow the logs of ${main}` : 'Follow the logs',
        },
    ];
    if (several) {
        into.push({
            args: ['logs', '-f', name, '--all-containers', '--prefix'],
            what: `Follow all ${containers.length} containers, each line marked with its container`,
        });
    }
    if (restarted) {
        const times = restarted.restartCount === 1 ? 'once' : `${restarted.restartCount} times`;
        into.push({
            args: ['logs', name, ...pick, '--previous'],
            what: `The logs from before the last restart (it has restarted ${times})`,
        });
    }
    into.push({
        args: ['exec', '-it', name, ...pick, '--', 'sh'],
        what: several ? `A shell in ${main}, if its image has one` : 'A shell in the container, if its image has one',
    });
    into.push(...portForwards(`pod/${name}`, containerPorts(containers)));

    const owner = controllerOf(pod);
    return [
        {
            id: 'look',
            title: 'Look',
            commands: [
                { args: ['get', 'pod', name, '-o', 'yaml'], what: 'The whole object, as the API server has it' },
                { args: ['describe', 'pod', name], what: 'Status, containers and recent events' },
                { args: ['events', '--for', `pod/${name}`], what: 'Just the events' },
            ],
        },
        { id: 'into', title: 'Logs, shells and ports', commands: into },
        {
            id: 'change',
            title: 'Change',
            commands: [
                {
                    args: ['delete', 'pod', name],
                    what: owner
                        ? `Delete it; its ${owner.kind} starts a replacement`
                        : 'Delete it. Nothing owns this Pod, so nothing will recreate it',
                },
            ],
        },
    ];
}

/** The container kubectl itself would pick: the annotated one, or the first. */
function defaultContainer(pod: Pod, containers: Container[]): string {
    const annotated = pod.metadata.annotations?.[DEFAULT_CONTAINER];
    if (annotated && containers.some((c) => c.name === annotated)) return annotated;
    return containers[0]?.name ?? '';
}

// ----- Deployments ---------------------------------------------------------

function deploymentCommands(deployment: Deployment): Group[] {
    const name = deployment.metadata.name;
    const ref = `deploy/${name}`;
    const spec = deployment.spec ?? {};
    const selector = selectorString(spec.selector);
    // An absent replicas field means one; that is the API's default.
    const replicas = spec.replicas ?? 1;

    const look: Command[] = [
        { args: ['get', 'deploy', name, '-o', 'yaml'], what: 'The whole object, as the API server has it' },
        { args: ['describe', 'deploy', name], what: 'Replicas, strategy, conditions and recent events' },
    ];
    if (selector) {
        look.push({ args: ['get', 'pods', '-l', selector], what: 'The Pods its selector matches' });
    }
    look.push(
        { args: ['rollout', 'status', ref], what: 'Wait for the current rollout to finish' },
        { args: ['rollout', 'history', ref], what: 'The revisions it can roll back to' },
    );

    const into: Command[] = [
        { args: ['logs', '-f', ref], what: 'Follow the logs of one of its Pods' },
        { args: ['exec', '-it', ref, '--', 'sh'], what: 'A shell in one of its Pods, if the image has one' },
        ...portForwards(ref, containerPorts(spec.template?.spec?.containers ?? [])),
    ];

    const change: Command[] = [
        { args: ['rollout', 'restart', ref], what: 'Replace every Pod, a few at a time' },
        { args: ['scale', ref, `--replicas=${replicas}`], what: `Change the replica count (${replicas} now)` },
        spec.paused
            ? { args: ['rollout', 'resume', ref], what: 'Resume the paused rollout' }
            : { args: ['rollout', 'pause', ref], what: 'Stop acting on changes until resumed' },
        { args: ['rollout', 'undo', ref], what: 'Go back to the previous revision' },
        { args: ['edit', 'deploy', name], what: 'Edit it in $EDITOR' },
    ];

    return [
        { id: 'look', title: 'Look', commands: look },
        { id: 'into', title: 'Logs, shells and ports', commands: into },
        { id: 'change', title: 'Change', commands: change },
    ];
}

// ----- Services ------------------------------------------------------------

function serviceCommands(service: Service): Group[] {
    const name = service.metadata.name;
    const spec = service.spec ?? {};
    const selector = mapSelectorString(spec.selector);

    const look: Command[] = [
        { args: ['get', 'svc', name, '-o', 'yaml'], what: 'The whole object, as the API server has it' },
        { args: ['describe', 'svc', name], what: 'Type, ports, endpoints and recent events' },
        {
            args: ['get', 'endpointslices', '-l', `kubernetes.io/service-name=${name}`],
            what: 'Where its traffic goes: the addresses behind it, and whether they are ready',
        },
    ];
    if (selector) {
        look.push({ args: ['get', 'pods', '-l', selector], what: 'The Pods its selector matches' });
    }

    // port-forward to a Service picks one of the Pods behind it, so it needs a
    // selector to find them. An ExternalName Service is a DNS alias with no
    // Pods; one without a selector has hand-made endpoints kubectl cannot
    // forward to. Offering the line for either would be offering an error.
    const forwardable = spec.type !== 'ExternalName' && selector !== '';
    const ports = forwardable
        ? (spec.ports ?? []).filter((p) => (p.protocol ?? 'TCP') === 'TCP' && p.port).map((p) => p.port as number)
        : [];

    return [
        { id: 'look', title: 'Look', commands: look },
        { id: 'into', title: 'Ports', commands: portForwards(`svc/${name}`, ports) },
        {
            id: 'change',
            title: 'Change',
            commands: [{ args: ['edit', 'svc', name], what: 'Edit it in $EDITOR' }],
        },
    ];
}

// ----- shared --------------------------------------------------------------

/**
 * The TCP ports the containers declare. port-forward only speaks TCP, so a
 * UDP port (DNS, say) would be a line that fails.
 */
function containerPorts(containers: Container[]): number[] {
    return containers.flatMap((c) =>
        (c.ports ?? [])
            .filter((p) => (p.protocol ?? 'TCP') === 'TCP' && p.containerPort)
            .map((p) => p.containerPort as number),
    );
}

function portForwards(ref: string, ports: number[]): Command[] {
    return [...new Set(ports)].slice(0, MAX_PORTS).map((port) => {
        const local = localPort(port);
        return {
            args: ['port-forward', ref, `${local}:${port}`],
            what: `Forward localhost:${local} to port ${port}`,
        };
    });
}

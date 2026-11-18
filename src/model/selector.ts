// A label selector written the way `kubectl -l` reads it.
//
// A Deployment's selector is a LabelSelector -- matchLabels and
// matchExpressions -- and a Service's is a plain map. Both become the same
// comma-separated string, in the set-based syntax for expressions:
// `tier in (web,api)`, `tier notin (db)`, `canary`, `!canary`.

import type { LabelSelector } from './kube.js';

/**
 * The selector as `-l` takes it, or `''` when it selects nothing in
 * particular. An empty selector matches every Pod in the namespace, and a
 * "Pods behind this" command that lists all of them would be wrong, so the
 * caller leaves the command out instead.
 *
 * Keys are sorted so the line is the same on every redraw, whatever order the
 * API server returned the map in.
 */
export function selectorString(selector: LabelSelector | undefined): string {
    if (!selector) return '';
    const parts = Object.entries(selector.matchLabels ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`);

    for (const req of selector.matchExpressions ?? []) {
        const values = [...(req.values ?? [])].sort().join(',');
        switch (req.operator) {
            case 'In':
                parts.push(`${req.key} in (${values})`);
                break;
            case 'NotIn':
                parts.push(`${req.key} notin (${values})`);
                break;
            case 'Exists':
                parts.push(req.key);
                break;
            case 'DoesNotExist':
                parts.push(`!${req.key}`);
                break;
            default:
                // An operator Kubernetes does not have. Dropping it would make
                // the selector match more than the object's own does, which is
                // worse than offering no command at all.
                return '';
        }
    }
    return parts.join(',');
}

/** A Service's map selector, as the same string. */
export function mapSelectorString(labels: Record<string, string> | undefined): string {
    return selectorString({ matchLabels: labels ?? {} });
}

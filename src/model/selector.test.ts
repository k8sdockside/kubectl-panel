import { describe, expect, test } from 'vitest';
import { mapSelectorString, selectorString } from './selector.js';

describe('selectorString', () => {
    test('writes matchLabels as key=value, sorted by key', () => {
        expect(selectorString({ matchLabels: { tier: 'front', app: 'web' } })).toBe('app=web,tier=front');
    });

    test('writes each expression operator in the set-based syntax', () => {
        expect(
            selectorString({
                matchLabels: { app: 'web' },
                matchExpressions: [
                    { key: 'tier', operator: 'In', values: ['web', 'api'] },
                    { key: 'env', operator: 'NotIn', values: ['dev'] },
                    { key: 'canary', operator: 'Exists' },
                    { key: 'legacy', operator: 'DoesNotExist' },
                ],
            }),
        ).toBe('app=web,tier in (api,web),env notin (dev),canary,!legacy');
    });

    test('an empty or absent selector is empty, so no command lists every Pod', () => {
        expect(selectorString(undefined)).toBe('');
        expect(selectorString({})).toBe('');
        expect(selectorString({ matchLabels: {} })).toBe('');
    });

    test('an operator Kubernetes does not have gives no selector rather than a wider one', () => {
        expect(
            selectorString({ matchLabels: { app: 'web' }, matchExpressions: [{ key: 'x', operator: 'Like' }] }),
        ).toBe('');
    });
});

describe('mapSelectorString', () => {
    test('writes a Service selector the same way', () => {
        expect(mapSelectorString({ app: 'web' })).toBe('app=web');
        expect(mapSelectorString(undefined)).toBe('');
    });
});

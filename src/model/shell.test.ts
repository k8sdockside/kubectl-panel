import { describe, expect, test } from 'vitest';
import { commandLine, quote } from './shell.js';

describe('quote', () => {
    test('leaves the words a shell reads as they are alone', () => {
        expect(quote('web-7d4f9-2xk11')).toBe('web-7d4f9-2xk11');
        expect(quote('deploy/web')).toBe('deploy/web');
        expect(quote('8080:80')).toBe('8080:80');
        expect(quote('--replicas=3')).toBe('--replicas=3');
        expect(quote('app=web,tier=front')).toBe('app=web,tier=front');
        expect(quote('arn:aws:eks:eu-north-1:123:cluster/prod')).toBe('arn:aws:eks:eu-north-1:123:cluster/prod');
    });

    test('quotes what a shell would split or expand', () => {
        expect(quote('tier in (web,api)')).toBe("'tier in (web,api)'");
        expect(quote('!canary')).toBe("'!canary'");
        expect(quote('$EDITOR')).toBe("'$EDITOR'");
        expect(quote('a*b')).toBe("'a*b'");
    });

    test('quotes a leading = or ~, which zsh and bash expand', () => {
        expect(quote('=kubectl')).toBe("'=kubectl'");
        expect(quote('~prod')).toBe("'~prod'");
    });

    test('writes a single quote so the shell reads it back', () => {
        expect(quote("Roger's laptop")).toBe(`'Roger'\\''s laptop'`);
    });

    test('an empty word is still a word', () => {
        expect(quote('')).toBe("''");
    });
});

describe('commandLine', () => {
    test('joins quoted words with spaces', () => {
        expect(commandLine(['kubectl', 'get', 'pods', '-l', 'tier in (web)'])).toBe("kubectl get pods -l 'tier in (web)'");
    });
});

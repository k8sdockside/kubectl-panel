// Writing an argument so a shell reads it back as the same single word.
//
// Names of Pods and Services are DNS labels and never need quoting, but plenty
// of what goes on these lines does: a label selector with `in (a,b)` in it, a
// context called `arn:aws:eks:...` (fine) or `Roger's laptop` (not fine). The
// commands are pasted into bash and zsh, so the quoting is the POSIX kind both
// read the same way: single quotes, with a single quote written as '\''.

/**
 * Characters that mean nothing to bash or zsh in the middle of a word. `=` and
 * `~` are in here but are still quoted at the *start* of a word -- zsh expands
 * `=word` to a command's path, and both expand a leading `~`.
 */
const PLAIN = /^[A-Za-z0-9_\-.\/:=,@%+~]+$/;

/** One argument, quoted only if a shell would otherwise read it differently. */
export function quote(arg: string): string {
    if (arg === '') return "''";
    if (PLAIN.test(arg) && !/^[=~]/.test(arg)) return arg;
    return `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** A whole command line from its words. */
export function commandLine(words: readonly string[]): string {
    return words.map(quote).join(' ');
}

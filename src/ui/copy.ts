// Putting a command on the clipboard, from inside the sandbox.
//
// The panel runs in a frame sandboxed with `allow-scripts` and nothing else,
// so it has an opaque origin and no clipboard permission of its own. Whether
// a copy works there depends on the engine (WKWebView, WebView2, WebKitGTK, or
// a browser in the web version), so this tries the async API, then the old
// copy command from the click, and reports which way it went. When neither
// works the caller selects the text instead, so Cmd/Ctrl+C is one key away --
// the line is never out of reach just because the clipboard is.

/** Resolves with whether the text reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Refused, or absent: fall through to the copy command.
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        area.remove();
    }
}

/** Selects everything in a node, so the user can copy it themselves. */
export function selectText(node: Node): void {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
}

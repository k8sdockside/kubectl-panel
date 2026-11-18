# kubectl-panel

A [K8s Dockside](https://github.com/k8sdockside/k8sdockside) plugin that puts a
**kubectl** panel on every Pod, Deployment and Service: the commands you would
type for the object you are looking at, filled in and ready to paste.

```
kubectl --context prod -n shop get deploy web -o yaml
kubectl --context prod -n shop describe deploy web
kubectl --context prod -n shop rollout restart deploy/web
kubectl --context prod -n shop logs -f deploy/web
kubectl --context prod -n shop port-forward svc/web 8080:80
```

It reads nothing but the object the panel is drawn for, so it works on any
cluster with nothing installed in it.

## Install it

**Settings → Plugins → From a repository**, and paste

```
https://github.com/k8sdockside/kubectl-panel
```

Then open any Pod, Deployment or Service: the panel is in the details view,
under **kubectl**. It needs K8s Dockside 0.1.36 or newer.

## What it lists

Three groups per object — **Look**, **Logs, shells and ports**, and **Change** —
each folding like the app's own sections.

| Kind | Look | Logs, shells and ports | Change |
| --- | --- | --- | --- |
| **Pod** | `get -o yaml`, `describe`, `events --for` | `logs -f`, `logs --all-containers --prefix`, `logs --previous`, `exec -it -- sh`, `port-forward` | `delete pod` |
| **Deployment** | `get -o yaml`, `describe`, `get pods -l`, `rollout status`, `rollout history` | `logs -f`, `exec -it -- sh`, `port-forward` | `rollout restart`, `scale`, `rollout pause`/`resume`, `rollout undo`, `edit` |
| **Service** | `get -o yaml`, `describe`, `get endpointslices`, `get pods -l` | `port-forward` | `edit` |

The object decides the details, so a line can be pasted without editing it:

- **The container.** With more than one, `logs` and `exec` name the one kubectl
  itself would pick — the `kubectl.kubernetes.io/default-container` annotation,
  or the first — and an `--all-containers` line is added.
- **`logs --previous`** is offered only when that container has restarted.
- **Ports.** Only TCP ports (port-forward speaks nothing else), at most three,
  and a port under 1024 is forwarded from 8000 higher — 80 from 8080, 443 from
  8443 — so it needs no root.
- **Selectors** are written out in full, set-based expressions included, and
  quoted for the shell: `-l 'tier in (api,web)'`. An empty selector gets no
  "Pods" line rather than one that lists the whole namespace.
- **The replica count** in `scale` is the current one, and a paused rollout is
  offered `resume` instead of `pause`.
- A Service with no selector, or of type `ExternalName`, gets no port-forward:
  kubectl would refuse it.
- **Deleting a Pod** says whether its controller will replace it, or that
  nothing will.

### Why every line says `--context`

K8s Dockside can have a dozen clusters open; your shell points at whichever one
you last switched to. A `rollout restart` copied from the production tab and
pasted into a shell pointed at staging — or the other way round — is the
mistake this panel must not make easy. So every line names the kubeconfig
context of the tab it came from, and in a shell that has no such context it
fails with `context "…" does not exist` rather than running somewhere else.

The name is the kubeconfig's, not an alias you gave the context in the app.
Untick **Name the cluster on every line** at the top of the panel to leave the
flag off; the choice is remembered for the plugin on that cluster.

### Copying

Each line has a copy button. The panel runs in a sandboxed frame, where some
engines refuse the clipboard; when that happens the line is selected instead
and the panel says to press ⌘C or Ctrl+C. A click on a line selects all of it,
too.

## Working on it

```sh
npm install
npm run watch     # rebuilds ui/ on every change under src/
npm test          # the model and the page, with no cluster
npm run check     # typecheck + tests + "is ui/ in step with src/"
```

Point the app at your checkout with **Settings → Plugins → Watch another
folder**. Run the app's own checks — the same ones CI runs — with:

```sh
go run github.com/k8sdockside/k8sdockside/cmd/plugincheck@main .
```

**Commit `ui/`.** Installing clones the repository and builds nothing, so a
change to `src/` whose `ui/` was not rebuilt never reaches anyone. `npm run
check` fails when the two disagree, and so does CI.

## Layout

```
plugin.json              the manifest: one section per kind, all opening kubectl.html
src/
  model/                 no DOM, all the logic, all the tests
    commands.ts          which commands each kind gets, and how a line is written
    selector.ts          label selectors as `kubectl -l` reads them
    shell.ts             quoting, so a pasted line is the words it shows
    kube.ts              the slices of Pods, Deployments and Services it reads
  ui/                    DOM helpers, the clipboard, icons
  pages/kubectl.ts       the panel
  styles/kubectl.css     the app's theme tokens, no colours of its own
ui/                      what the build writes, and what the app serves
```

## License

Apache-2.0.

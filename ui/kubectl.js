// Built by k8sdockside-plugin from src/ -- edit the TypeScript there, not this file.
"use strict";
(() => {
  // node_modules/@k8sdockside/plugin-sdk/dom.js
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === void 0 || value === false) continue;
      if (name === "class") node.className = String(value);
      else if (name === "text") node.textContent = String(value);
      else node.setAttribute(name, String(value));
    }
    append(node, children);
    return node;
  }
  function button(label, onClick, attrs = {}) {
    const node = el("button", { type: "button", ...attrs }, label);
    node.addEventListener("click", onClick);
    return node;
  }
  function replace(parent, ...children) {
    parent.replaceChildren();
    append(parent, children);
  }
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`the page has no #${id}`);
    return node;
  }
  function svg(markup, className = "icon") {
    const holder = document.createElement("span");
    holder.innerHTML = markup;
    const node = holder.firstElementChild;
    if (!node) throw new Error("svg() was given no element");
    node.setAttribute("class", className);
    return node;
  }
  function append(parent, children) {
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      parent.append(child);
    }
  }

  // src/ui/page.ts
  function fail(host, err) {
    const message = err instanceof Error ? err.message : String(err);
    replace(
      host,
      el("div", { class: "failure" }, el("strong", {}, "That did not work. "), el("span", {}, message))
    );
  }
  function start(hostId, body) {
    const run = async () => {
      const host = document.getElementById(hostId);
      try {
        const ctx = await k8sdockside.ready();
        await body(ctx);
      } catch (err) {
        if (host) fail(host, err);
      }
    };
    void run();
  }

  // src/ui/copy.ts
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
  function selectText(node) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // src/ui/icons.ts
  var COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
  var TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';

  // src/model/shell.ts
  var PLAIN = /^[A-Za-z0-9_\-.\/:=,@%+~]+$/;
  function quote(arg) {
    if (arg === "") return "''";
    if (PLAIN.test(arg) && !/^[=~]/.test(arg)) return arg;
    return `'${arg.replaceAll("'", `'\\''`)}'`;
  }
  function commandLine(words) {
    return words.map(quote).join(" ");
  }

  // src/model/selector.ts
  function selectorString(selector) {
    if (!selector) return "";
    const parts = Object.entries(selector.matchLabels ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`);
    for (const req of selector.matchExpressions ?? []) {
      const values = [...req.values ?? []].sort().join(",");
      switch (req.operator) {
        case "In":
          parts.push(`${req.key} in (${values})`);
          break;
        case "NotIn":
          parts.push(`${req.key} notin (${values})`);
          break;
        case "Exists":
          parts.push(req.key);
          break;
        case "DoesNotExist":
          parts.push(`!${req.key}`);
          break;
        default:
          return "";
      }
    }
    return parts.join(",");
  }
  function mapSelectorString(labels) {
    return selectorString({ matchLabels: labels ?? {} });
  }

  // src/model/kube.ts
  var PANEL_KINDS = ["pods", "deployments", "services"];
  function isPanelKind(kind) {
    return PANEL_KINDS.includes(kind);
  }
  function controllerOf(obj) {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
  }

  // src/model/commands.ts
  var MAX_PORTS = 3;
  var DEFAULT_CONTAINER = "kubectl.kubernetes.io/default-container";
  function render(command, target) {
    const words = ["kubectl"];
    if (target.context) words.push("--context", target.context);
    if (target.namespace) words.push("-n", target.namespace);
    return commandLine([...words, ...command.args]);
  }
  function contextFromId(contextId) {
    const at = contextId.indexOf("::");
    return at < 0 ? contextId : contextId.slice(at + 2);
  }
  function localPort(remote) {
    return remote < 1024 ? remote + 8e3 : remote;
  }
  function commandsFor(kind, object) {
    const groups = kind === "pods" ? podCommands(object) : kind === "deployments" ? deploymentCommands(object) : serviceCommands(object);
    return groups.filter((group) => group.commands.length > 0);
  }
  function podCommands(pod) {
    const name = pod.metadata.name;
    const containers = pod.spec?.containers ?? [];
    const several = containers.length > 1;
    const main = defaultContainer(pod, containers);
    const pick = several && main ? ["-c", main] : [];
    const restarted = (pod.status?.containerStatuses ?? []).find(
      (status) => status.name === main && (status.restartCount ?? 0) > 0
    );
    const into = [
      {
        args: ["logs", "-f", name, ...pick],
        what: several ? `Follow the logs of ${main}` : "Follow the logs"
      }
    ];
    if (several) {
      into.push({
        args: ["logs", "-f", name, "--all-containers", "--prefix"],
        what: `Follow all ${containers.length} containers, each line marked with its container`
      });
    }
    if (restarted) {
      const times = restarted.restartCount === 1 ? "once" : `${restarted.restartCount} times`;
      into.push({
        args: ["logs", name, ...pick, "--previous"],
        what: `The logs from before the last restart (it has restarted ${times})`
      });
    }
    into.push({
      args: ["exec", "-it", name, ...pick, "--", "sh"],
      what: several ? `A shell in ${main}, if its image has one` : "A shell in the container, if its image has one"
    });
    into.push(...portForwards(`pod/${name}`, containerPorts(containers)));
    const owner = controllerOf(pod);
    return [
      {
        id: "look",
        title: "Look",
        commands: [
          { args: ["get", "pod", name, "-o", "yaml"], what: "The whole object, as the API server has it" },
          { args: ["describe", "pod", name], what: "Status, containers and recent events" },
          { args: ["events", "--for", `pod/${name}`], what: "Just the events" }
        ]
      },
      { id: "into", title: "Logs, shells and ports", commands: into },
      {
        id: "change",
        title: "Change",
        commands: [
          {
            args: ["delete", "pod", name],
            what: owner ? `Delete it; its ${owner.kind} starts a replacement` : "Delete it. Nothing owns this Pod, so nothing will recreate it"
          }
        ]
      }
    ];
  }
  function defaultContainer(pod, containers) {
    const annotated = pod.metadata.annotations?.[DEFAULT_CONTAINER];
    if (annotated && containers.some((c) => c.name === annotated)) return annotated;
    return containers[0]?.name ?? "";
  }
  function deploymentCommands(deployment) {
    const name = deployment.metadata.name;
    const ref = `deploy/${name}`;
    const spec = deployment.spec ?? {};
    const selector = selectorString(spec.selector);
    const replicas = spec.replicas ?? 1;
    const look = [
      { args: ["get", "deploy", name, "-o", "yaml"], what: "The whole object, as the API server has it" },
      { args: ["describe", "deploy", name], what: "Replicas, strategy, conditions and recent events" }
    ];
    if (selector) {
      look.push({ args: ["get", "pods", "-l", selector], what: "The Pods its selector matches" });
    }
    look.push(
      { args: ["rollout", "status", ref], what: "Wait for the current rollout to finish" },
      { args: ["rollout", "history", ref], what: "The revisions it can roll back to" }
    );
    const into = [
      { args: ["logs", "-f", ref], what: "Follow the logs of one of its Pods" },
      { args: ["exec", "-it", ref, "--", "sh"], what: "A shell in one of its Pods, if the image has one" },
      ...portForwards(ref, containerPorts(spec.template?.spec?.containers ?? []))
    ];
    const change = [
      { args: ["rollout", "restart", ref], what: "Replace every Pod, a few at a time" },
      { args: ["scale", ref, `--replicas=${replicas}`], what: `Change the replica count (${replicas} now)` },
      spec.paused ? { args: ["rollout", "resume", ref], what: "Resume the paused rollout" } : { args: ["rollout", "pause", ref], what: "Stop acting on changes until resumed" },
      { args: ["rollout", "undo", ref], what: "Go back to the previous revision" },
      { args: ["edit", "deploy", name], what: "Edit it in $EDITOR" }
    ];
    return [
      { id: "look", title: "Look", commands: look },
      { id: "into", title: "Logs, shells and ports", commands: into },
      { id: "change", title: "Change", commands: change }
    ];
  }
  function serviceCommands(service) {
    const name = service.metadata.name;
    const spec = service.spec ?? {};
    const selector = mapSelectorString(spec.selector);
    const look = [
      { args: ["get", "svc", name, "-o", "yaml"], what: "The whole object, as the API server has it" },
      { args: ["describe", "svc", name], what: "Type, ports, endpoints and recent events" },
      {
        args: ["get", "endpointslices", "-l", `kubernetes.io/service-name=${name}`],
        what: "Where its traffic goes: the addresses behind it, and whether they are ready"
      }
    ];
    if (selector) {
      look.push({ args: ["get", "pods", "-l", selector], what: "The Pods its selector matches" });
    }
    const forwardable = spec.type !== "ExternalName" && selector !== "";
    const ports = forwardable ? (spec.ports ?? []).filter((p) => (p.protocol ?? "TCP") === "TCP" && p.port).map((p) => p.port) : [];
    return [
      { id: "look", title: "Look", commands: look },
      { id: "into", title: "Ports", commands: portForwards(`svc/${name}`, ports) },
      {
        id: "change",
        title: "Change",
        commands: [{ args: ["edit", "svc", name], what: "Edit it in $EDITOR" }]
      }
    ];
  }
  function containerPorts(containers) {
    return containers.flatMap(
      (c) => (c.ports ?? []).filter((p) => (p.protocol ?? "TCP") === "TCP" && p.containerPort).map((p) => p.containerPort)
    );
  }
  function portForwards(ref, ports) {
    return [...new Set(ports)].slice(0, MAX_PORTS).map((port) => {
      const local = localPort(port);
      return {
        args: ["port-forward", ref, `${local}:${port}`],
        what: `Forward localhost:${local} to port ${port}`
      };
    });
  }

  // src/pages/kubectl.ts
  var NAME_CONTEXT_KEY = "name-context";
  var COPIED_MS = 1500;
  start("page", async (ctx) => {
    const host = byId("panel");
    if (!ctx.object || !isPanelKind(ctx.object.kind)) {
      replace(host, el("p", { class: "empty" }, "This page is a panel; open a Pod, Deployment or Service."));
      return;
    }
    const kind = ctx.object.kind;
    const namespace = ctx.object.namespace;
    const context = contextFromId(ctx.contextId);
    try {
      let row2 = function(command) {
        const line = el("code", { class: "line" }, render(command, target()));
        lines.push({ node: line, command });
        const copy = button("", () => void copyLine(line, copy), {
          class: "copy",
          title: "Copy",
          "aria-label": "Copy the command"
        });
        copy.append(svg(COPY, "icon"));
        return el("div", { class: "cmd" }, line, copy, el("div", { class: "what" }, command.what));
      }, contextBox2 = function() {
        const box = el("input", { type: "checkbox", id: "name-context" });
        box.checked = nameContext;
        box.addEventListener("change", () => {
          nameContext = box.checked;
          for (const { node, command } of lines) node.textContent = render(command, target());
          void saveNameContext(nameContext);
        });
        return el(
          "label",
          { class: "context", for: "name-context" },
          box,
          el("span", {}, "Name the cluster on every line: "),
          el("code", {}, commandLine(["--context", context]))
        );
      };
      var row = row2, contextBox = contextBox2;
      const object = await k8sdockside.object();
      let nameContext = await readNameContext();
      const target = () => ({ namespace, context: nameContext ? context : "" });
      const lines = [];
      const status = el("p", { class: "hint", role: "status" });
      replace(host);
      if (context) host.append(contextBox2());
      for (const group of commandsFor(kind, object)) {
        const section = k8sdockside.ui.section({
          id: group.id,
          title: group.title,
          count: group.commands.length,
          what: `the ${group.title.toLowerCase()} commands`,
          parent: host
        });
        section.body.append(...group.commands.map(row2));
      }
      host.append(status);
      async function copyLine(line, copy) {
        const text = line.textContent ?? "";
        if (await copyText(text)) {
          status.textContent = "";
          replace(copy, svg(TICK, "icon"));
          copy.classList.add("copied");
          setTimeout(() => {
            replace(copy, svg(COPY, "icon"));
            copy.classList.remove("copied");
          }, COPIED_MS);
          return;
        }
        selectText(line);
        const keys = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘C" : "Ctrl+C";
        status.textContent = `The clipboard is not available here, so the line is selected: press ${keys} to copy it.`;
      }
    } catch (err) {
      fail(host, err);
    }
  });
  async function readNameContext() {
    try {
      const saved = await k8sdockside.storage?.get(NAME_CONTEXT_KEY);
      return saved !== false;
    } catch {
      return true;
    }
  }
  async function saveNameContext(value) {
    try {
      await k8sdockside.storage?.set(NAME_CONTEXT_KEY, value);
    } catch {
    }
  }
})();

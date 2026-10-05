// PluginApi host. Installed before any plugin script runs, so plugins can register
// the same patches they use in classic Stash (PluginSettings, ScenePage).
// Stash UI then renders those components. Scripts that never mention PluginApi
// (classic navbar injectors) are not executed.

import { gql, setPluginConfig } from "./api.js";
import { toast } from "./ui.js";

const SKIP_IDS = new Set(["stashui"]);

let booted = null;
let reactReady = null;
let configsLoaded = false;
let pluginConfigs = {};
const configListeners = new Set();
const saveTimers = new Map();

const beforeFns = {};
const insteadFns = {};
const afterFns = {};
const patched = {};

function notifyConfigs() {
  configListeners.forEach((fn) => fn());
}

function loadClassicScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load " + url));
    document.head.appendChild(s);
  });
}

function ensureReact() {
  if (!reactReady) {
    reactReady = (async () => {
      const base = new URL("./vendor/", import.meta.url);
      await loadClassicScript(new URL("react.production.min.js", base).href);
      await loadClassicScript(new URL("react-dom.production.min.js", base).href);
      if (!window.React || !window.ReactDOM || typeof window.ReactDOM.createRoot !== "function") {
        throw new Error("React did not load");
      }
      return { React: window.React, ReactDOM: window.ReactDOM };
    })();
  }
  return reactReady;
}

function runInstead(fns, targetFn, thisArg, argArray) {
  if (!fns.length) return targetFn.apply(thisArg, argArray);
  let i = 1;
  function next() {
    if (i >= fns.length) return targetFn;
    const thisTarget = fns[i++];
    return new Proxy(thisTarget, {
      apply(target, ctx, args) {
        return target.apply(ctx, args.concat(next()));
      },
    });
  }
  return fns[0].apply(thisArg, argArray.concat(next()));
}

function patchFunction(name, fn) {
  return new Proxy(fn, {
    apply(target, ctx, args) {
      let nextArgs = args;
      for (const beforeFn of beforeFns[name] || []) nextArgs = beforeFn.apply(ctx, nextArgs);
      let result = insteadFns[name]
        ? runInstead(insteadFns[name], target, ctx, nextArgs)
        : target.apply(ctx, nextArgs);
      for (const afterFn of afterFns[name] || []) result = afterFn.apply(ctx, nextArgs.concat(result));
      return result;
    },
  });
}

function patchedComponent(name, fallback) {
  if (!patched[name]) patched[name] = patchFunction(name, fallback);
  return patched[name];
}

function activeVideo() {
  const list = [...document.querySelectorAll("video.kb-video")];
  return list.find((v) => v.getBoundingClientRect().width > 40) || list[0] || null;
}

function getPlayer() {
  const video = activeVideo();
  if (!video) return null;
  return {
    currentTime() {
      return video.currentTime;
    },
  };
}

function useSettings() {
  const React = window.React;
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    configListeners.add(fn);
    return () => configListeners.delete(fn);
  }, []);

  function savePluginSettings(pluginID, input) {
    const next = Object.assign({}, pluginConfigs[pluginID], input);
    Object.keys(input || {}).forEach((k) => input[k] === undefined && delete next[k]);
    pluginConfigs = Object.assign({}, pluginConfigs, { [pluginID]: next });
    notifyConfigs();
    const patch = Object.assign({}, next);
    Object.keys(input || {}).forEach((k) => input[k] === undefined && (patch[k] = undefined));
    clearTimeout(saveTimers.get(pluginID));
    saveTimers.set(
      pluginID,
      setTimeout(() => {
        setPluginConfig(pluginID, patch).catch((err) => toast(err.message || String(err), "error"));
      }, 400)
    );
  }

  return { plugins: pluginConfigs, loading: !configsLoaded, savePluginSettings };
}

function useToast() {
  return {
    success(message) {
      toast(String(message == null ? "" : message), "ok");
    },
    error(message) {
      toast(String(message == null ? "" : message), "error");
    },
  };
}

function useConfigurationQuery() {
  const React = window.React;
  const [data, setData] = React.useState(configsLoaded ? { configuration: { plugins: pluginConfigs } } : null);
  React.useEffect(() => {
    let cancelled = false;
    gql(`query { configuration { plugins } }`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, loading: !data };
}

function useFindTagsLazyQuery() {
  const React = window.React;
  const findTags = React.useCallback(async ({ variables } = {}) => {
    const data = await gql(
      `query($filter: FindFilterType, $tag_filter: TagFilterType) {
        findTags(filter: $filter, tag_filter: $tag_filter) { tags { id name } }
      }`,
      variables || {}
    );
    return { data };
  }, []);
  return [findTags];
}

function useSceneMarkerCreateMutation() {
  const React = window.React;
  const createMarker = React.useCallback(async ({ variables } = {}) => {
    const data = await gql(
      `mutation($input: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $input) { id } }`,
      variables || {}
    );
    return { data };
  }, []);
  return [createMarker];
}

function Button(props) {
  const React = window.React;
  const { variant, size, className, onClick, type, children, disabled } = props;
  return React.createElement(
    "button",
    {
      type: type || "button",
      disabled: disabled,
      className: ["btn", variant && "btn-" + variant, size && "btn-" + size, className].filter(Boolean).join(" "),
      onClick,
    },
    children
  );
}

function Link(props) {
  const React = window.React;
  return React.createElement(
    "a",
    { href: props.to || props.href || "#", className: props.className, onClick: props.onClick },
    props.children
  );
}

function useLocation() {
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
}

const bindings = new Map();

function keyName(e) {
  if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  const key = String(e.key || "").toLowerCase();
  if (key === " ") return "space";
  return key;
}

function comboOf(e) {
  const name = keyName(e);
  if (!name || name === "shift" || name === "control" || name === "alt" || name === "meta") return "";
  const parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  if (e.shiftKey) parts.push("shift");
  parts.push(name);
  return parts.join("+");
}

function onPluginHotkey(e) {
  const target = e.target;
  if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
  const list = bindings.get(comboOf(e));
  if (!list || !list.length) return;
  for (const fn of list) {
    if (fn(e) === false) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

const Mousetrap = {
  bind(combo, fn) {
    const key = String(combo || "").toLowerCase();
    if (!key || typeof fn !== "function") return;
    if (!bindings.has(key)) bindings.set(key, []);
    bindings.get(key).push(fn);
  },
  unbind(combo) {
    bindings.delete(String(combo || "").toLowerCase());
  },
};

function DefaultPluginSettings({ pluginID, settings }) {
  const React = window.React;
  const { plugins, savePluginSettings } = useSettings();
  if (!settings || !settings.length) return null;
  const values = (plugins && plugins[pluginID]) || {};

  function commit(name, value) {
    savePluginSettings(pluginID, { [name]: value });
  }

  return React.createElement(
    "div",
    { className: "kb-plugin-settings-fields" },
    settings.map((s) => {
      const label = React.createElement(
        "span",
        { className: "kb-set-label" },
        React.createElement("b", null, s.display_name || s.name),
        s.description ? React.createElement("small", null, s.description) : null
      );
      if (s.type === "BOOLEAN") {
        return React.createElement(
          "label",
          { className: "kb-set kb-set-bool", key: s.name },
          label,
          React.createElement(
            "span",
            { className: "kb-switch" },
            React.createElement("input", {
              type: "checkbox",
              checked: !!values[s.name],
              onChange(e) {
                commit(s.name, e.target.checked);
              },
            }),
            React.createElement("i")
          )
        );
      }
      const text = values[s.name] == null ? "" : String(values[s.name]);
      const long = s.type !== "NUMBER" && (text.length > 80 || /json/i.test(s.name));
      return React.createElement(
        "label",
        { className: "kb-set", key: s.name },
        label,
        React.createElement(long ? "textarea" : "input", {
          className: "kb-field" + (s.type === "NUMBER" ? " kb-num" : ""),
          type: s.type === "NUMBER" ? "number" : "text",
          rows: long ? 8 : undefined,
          value: text,
          spellCheck: false,
          onChange(e) {
            const raw = e.target.value;
            if (s.type === "NUMBER") commit(s.name, raw === "" ? undefined : Number(raw));
            else commit(s.name, raw);
          },
        })
      );
    })
  );
}

function makeBoundary(React, fallback) {
  function Boundary(props) {
    React.Component.call(this, props);
    this.state = { error: null };
  }
  Boundary.prototype = Object.create(React.Component.prototype);
  Boundary.prototype.constructor = Boundary;
  Boundary.getDerivedStateFromError = function () {
    return { error: true };
  };
  Boundary.prototype.componentDidCatch = function (err) {
    console.error("[Stash UI] plugin UI failed", err);
  };
  Boundary.prototype.render = function () {
    if (this.state.error) return fallback ? fallback(this.props) : null;
    return this.props.children;
  };
  return Boundary;
}

function installApi(React) {
  const NavLink = function NavLink(props) {
    return Link(props);
  };
  const hooks = { useSettings, useToast };
  const GQL = {
    useConfigurationQuery,
    useFindTagsLazyQuery,
    useSceneMarkerCreateMutation,
    CriterionModifier: { Equals: "EQUALS", Includes: "INCLUDES" },
  };
  const api = {
    React,
    ReactDOM: window.ReactDOM,
    GQL,
    libraries: {
      Bootstrap: { Button, Nav: { Link: NavLink } },
      ReactRouterDOM: { Link, useLocation, useHistory() { return { push(url) { window.location.assign(url); } }; }, useNavigate() { return (url) => window.location.assign(url); } },
      Mousetrap,
    },
    hooks,
    utils: {
      InteractiveUtils: { getPlayer },
      StashService: {},
    },
    register: { route() {}, component() {} },
    patch: {
      before(name, fn) {
        (beforeFns[name] || (beforeFns[name] = [])).push(fn);
      },
      instead(name, fn) {
        (insteadFns[name] || (insteadFns[name] = [])).push(fn);
      },
      after(name, fn) {
        (afterFns[name] || (afterFns[name] = [])).push(fn);
      },
    },
  };
  window.PluginApi = api;
  if (!window.__kbPluginHotkeys) {
    window.__kbPluginHotkeys = true;
    document.addEventListener("keydown", onPluginHotkey, true);
  }
}

function sortPlugins(list) {
  const byId = new Map(list.map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  function visit(plugin) {
    if (!plugin || seen.has(plugin.id)) return;
    seen.add(plugin.id);
    for (const req of plugin.requires || []) visit(byId.get(req));
    out.push(plugin);
  }
  list.forEach(visit);
  return out;
}

function loadCss(href) {
  if (!href || document.querySelector(`link[data-kb-plugin-css="${CSS.escape(href)}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.kbPluginCss = href;
  document.head.appendChild(link);
}

async function loadPluginScripts() {
  let plugins = [];
  try {
    const d = await gql(`query { plugins { id enabled requires paths { javascript css } } }`);
    plugins = d.plugins || [];
  } catch (err) {
    console.error("[Stash UI] could not list plugins", err);
    return;
  }
  const enabled = sortPlugins(plugins.filter((p) => p.enabled && !SKIP_IDS.has(p.id)));
  for (const plugin of enabled) {
    const scripts = [];
    for (const src of (plugin.paths && plugin.paths.javascript) || []) {
      try {
        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) throw new Error(res.status + " " + src);
        const text = await res.text();
        if (/\bPluginApi\b/.test(text)) scripts.push(src);
      } catch (err) {
        console.error("[Stash UI] plugin script failed", src, err);
      }
    }
    if (!scripts.length) continue;
    for (const href of (plugin.paths && plugin.paths.css) || []) loadCss(href);
    for (const src of scripts) {
      try {
        await loadClassicScript(src);
      } catch (err) {
        console.error("[Stash UI] plugin script failed", src, err);
      }
    }
  }
}

async function loadConfigs() {
  try {
    const d = await gql(`query { configuration { plugins } }`);
    pluginConfigs = (d.configuration && d.configuration.plugins) || {};
  } catch (err) {
    console.error("[Stash UI] plugin configuration", err);
  } finally {
    configsLoaded = true;
    notifyConfigs();
  }
}

async function boot() {
  const { React } = await ensureReact();
  installApi(React);
  await Promise.all([loadConfigs(), loadPluginScripts()]);
}

export function bootPluginHost() {
  if (!booted) {
    booted = boot().catch((err) => {
      console.error("[Stash UI] plugin host failed", err);
      booted = null;
      throw err;
    });
  }
  return booted;
}

export function unmountPluginHost(el) {
  if (el && typeof el._kbUnmount === "function") el._kbUnmount();
}

export async function renderPluginSettings(el, props) {
  await bootPluginHost();
  unmountPluginHost(el);
  const { React, ReactDOM } = await ensureReact();
  const Boundary = makeBoundary(React, () => React.createElement(DefaultPluginSettings, props));
  const root = ReactDOM.createRoot(el);
  const Comp = patchedComponent("PluginSettings", DefaultPluginSettings);
  const tree = React.createElement(Boundary, null, React.createElement(Comp, props));
  ReactDOM.flushSync(() => root.render(tree));
  const unmount = () => {
    root.unmount();
    if (el._kbUnmount === unmount) el._kbUnmount = null;
  };
  el._kbUnmount = unmount;
  return unmount;
}

export async function mountScenePage(el, scene) {
  await bootPluginHost();
  const { React, ReactDOM } = await ensureReact();
  const Boundary = makeBoundary(React, null);
  const root = ReactDOM.createRoot(el);
  const Comp = patchedComponent("ScenePage", function ScenePage() { return null; });
  root.render(React.createElement(Boundary, null, React.createElement(Comp, { scene })));
  return () => root.unmount();
}

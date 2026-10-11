/**
 * PROTOTYPE (#146), never for main: three structurally different variants of a plugin's details and
 * the install choices, on `/dev/plugins-prototype?variant=A|B|C`, with stub data shaped like
 * `claude plugin list --json --available`. No Claude Code runs; installing only changes memory.
 *
 * - A: a list and a details pane side by side; Install opens a dialog with the choices.
 * - B: one list; a row opens in place, with the details and the choices inline.
 * - C: a page per plugin, the details in a column and an install panel in steps beside them.
 */
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupButton, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------------------------
// Stub data, as the catalog and the sessions would give it.

interface Plugin {
  id: string;
  name: string;
  marketplace: string;
  description: string;
  version: string;
  installs: number | null;
  source: string;
  /** A command the marketplace declares, which Claude Code shows before it runs (`shownCommand`). */
  shownCommand?: string;
}

const catalog: Plugin[] = [
  {
    id: "superpowers@claude-plugins-official",
    name: "superpowers",
    marketplace: "claude-plugins-official",
    description:
      "Core skills library: test-driven development, debugging, collaboration patterns and proven techniques.",
    version: "4.3.1",
    installs: 182_400,
    source: "github:obra/superpowers",
  },
  {
    id: "github@claude-plugins-official",
    name: "github",
    marketplace: "claude-plugins-official",
    description: "Official GitHub MCP server: issues, pull requests, code review and repositories.",
    version: "1.2.0",
    installs: 96_120,
    source: "github:anthropics/claude-plugins-official/external_plugins/github",
  },
  {
    id: "frontend-design@claude-plugins-official",
    name: "frontend-design",
    marketplace: "claude-plugins-official",
    description:
      "Distinctive, production-grade frontend interfaces that avoid generic AI aesthetics.",
    version: "1.0.4",
    installs: 71_880,
    source: "github:anthropics/claude-plugins-official/plugins/frontend-design",
  },
  {
    id: "mattpocock-skills@mattpocock",
    name: "mattpocock-skills",
    marketplace: "mattpocock",
    description: "TDD, grilling, prototypes, code review and issue-tracker skills for agents.",
    version: "2.8.0",
    installs: 12_310,
    source: "github:mattpocock/skills",
  },
  {
    id: "acme-deploy@acme-internal",
    name: "acme-deploy",
    marketplace: "acme-internal",
    description: "Deploys services to Acme's staging and production clusters, with rollbacks.",
    version: "0.9.2",
    installs: null,
    source: "git:https://git.acme.example/platform/claude-marketplace.git",
    shownCommand: "npx -y @acme/deploy-cli@0.9.2 setup --cluster staging",
  },
  {
    id: "rust-analyzer-lsp@claude-plugins-official",
    name: "rust-analyzer-lsp",
    marketplace: "claude-plugins-official",
    description: "Rust language server for Claude: diagnostics, go to definition, references.",
    version: "1.0.0",
    installs: null,
    source: "github:anthropics/claude-plugins-official/plugins/rust-analyzer-lsp",
  },
];

interface StubProject {
  id: string;
  name: string;
  path: string;
  trusted: boolean;
}

/** The folder projects, the open session's first; the Playground is not offered. */
const projects: StubProject[] = [
  { id: "arden", name: "arden-code", path: "C:\\Users\\Ada\\Projects\\arden-code", trusted: true },
  { id: "api", name: "billing-api", path: "C:\\Work\\billing-api", trusted: false },
  { id: "site", name: "website", path: "C:\\Work\\website", trusted: true },
];

type Scope = "user" | "local" | "project";

const scopes: { value: Scope; label: string; detail: string }[] = [
  {
    value: "user",
    label: "For you, in every project",
    detail: "Only you get it, wherever you work.",
  },
  {
    value: "local",
    label: "For you, in this project",
    detail: "Only you get it, and only in the project you choose.",
  },
  {
    value: "project",
    label: "For everyone in this project",
    detail:
      "Changes the project's shared .claude/settings.json: your collaborators get it once you commit it.",
  },
];

const warning =
  "A plugin can run programs on this computer through its hooks and servers. Install only plugins you trust.";

const installsText = (plugin: Plugin) =>
  plugin.installs === null ? "No install count" : `${plugin.installs.toLocaleString()} installs`;

/** What an install would do, in memory: the trust question, then the command, then done. */
type Step =
  | { kind: "choosing" }
  | { kind: "trust"; project: StubProject }
  | { kind: "command"; command: string }
  | { kind: "installing" }
  | { kind: "done"; message: string };

function useInstall(plugin: Plugin) {
  const [scope, setScope] = useState<Scope>("user");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [step, setStep] = useState<Step>({ kind: "choosing" });
  const [trusted, setTrusted] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState(false);
  const project = projects.find((candidate) => candidate.id === projectId);

  useEffect(() => {
    setStep({ kind: "choosing" });
    setAccepted(false);
  }, [plugin.id]);

  const finish = () => {
    setStep({ kind: "installing" });
    setTimeout(() => {
      const where =
        scope === "user"
          ? "for you, in every project"
          : `${scope === "local" ? "for you" : "for everyone"} in ${project?.name ?? ""}`;
      setStep({ kind: "done", message: `Installed ${plugin.name} ${where}.` });
    }, 700);
  };
  const install = (acceptedNow = accepted) => {
    if (scope !== "user" && project && !project.trusted && !trusted.has(project.id)) {
      setStep({ kind: "trust", project });
      return;
    }
    if (plugin.shownCommand && !acceptedNow) {
      setStep({ kind: "command", command: plugin.shownCommand });
      return;
    }
    finish();
  };
  return {
    scope,
    setScope,
    projectId,
    setProjectId,
    project,
    step,
    install,
    trust: () => {
      if (step.kind !== "trust") return;
      setTrusted(new Set([...trusted, step.project.id]));
      setStep({ kind: "choosing" });
      setTimeout(() => {
        install();
      });
    },
    accept: () => {
      setAccepted(true);
      install(true);
    },
    cancel: () => {
      setStep({ kind: "choosing" });
    },
  };
}

type Install = ReturnType<typeof useInstall>;

function ProjectSelect({ install, className }: { install: Install; className?: string }) {
  return (
    <select
      aria-label="Project"
      className={cn(
        "h-8 w-full border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      value={install.projectId}
      onChange={(event) => {
        install.setProjectId(event.target.value);
      }}
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
          {project.trusted ? "" : " (not trusted yet)"}
        </option>
      ))}
    </select>
  );
}

function Warning({ className }: { className?: string }) {
  return (
    <p className={cn("flex gap-2 text-xs text-muted-foreground", className)}>
      <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      {warning}
    </p>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="overflow-x-auto border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
      {command}
    </pre>
  );
}

/** The status line after Install: under way, or done. */
function Outcome({ install }: { install: Install }) {
  if (install.step.kind === "installing") {
    return <p className="text-xs text-muted-foreground">Installing…</p>;
  }
  if (install.step.kind === "done") {
    return <p className="text-xs text-foreground">{install.step.message}</p>;
  }
  return null;
}

function Facts({ plugin }: { plugin: Plugin }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Marketplace</dt>
      <dd>{plugin.marketplace}</dd>
      <dt className="text-muted-foreground">Version</dt>
      <dd>{plugin.version}</dd>
      <dt className="text-muted-foreground">Installs</dt>
      <dd>{installsText(plugin)}</dd>
      <dt className="text-muted-foreground">Source</dt>
      <dd className="font-mono break-all">{plugin.source}</dd>
    </dl>
  );
}

function Search({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  return (
    <Input
      aria-label="Search plugins"
      placeholder="Search plugins"
      value={query}
      onChange={(event) => {
        onQuery(event.target.value);
      }}
    />
  );
}

const matching = (query: string) =>
  catalog
    .filter((plugin) =>
      `${plugin.name} ${plugin.description}`.toLowerCase().includes(query.toLowerCase()),
    )
    .toSorted((a, b) => (b.installs ?? -1) - (a.installs ?? -1) || a.name.localeCompare(b.name));

function PageHeading({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Plugins</h1>
        {children}
      </div>
      <p className="text-sm text-muted-foreground">
        Plugins bring skills, slash commands and tools to your agents.
      </p>
    </div>
  );
}

/** The trust question, as the app asks it before an agent first works in a project (ADR 0039). */
function TrustDialog({ install }: { install: Install }) {
  const open = install.step.kind === "trust";
  const name = install.step.kind === "trust" ? install.step.project.name : "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) install.cancel();
      }}
    >
      <DialogContent showCloseButton={false} role="alertdialog">
        <DialogHeader>
          <DialogTitle>Trust “{name}”?</DialogTitle>
          <DialogDescription>
            Claude Code reads this project's settings and runs its hooks and servers. Trust it only
            if you know where it comes from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={install.cancel}>
            Cancel
          </Button>
          <Button onClick={install.trust}>Trust folder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The marketplace's command, as a confirmation of its own (variants A and C). */
function CommandDialog({ plugin, install }: { plugin: Plugin; install: Install }) {
  const open = install.step.kind === "command";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) install.cancel();
      }}
    >
      <DialogContent showCloseButton={false} role="alertdialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run a command for {plugin.name}?</DialogTitle>
          <DialogDescription>
            The {plugin.marketplace} marketplace asks to run this command on this computer to set
            the plugin up. Read it in full: only this command runs.
          </DialogDescription>
        </DialogHeader>
        {install.step.kind === "command" ? <CommandBlock command={install.step.command} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={install.cancel}>
            Cancel
          </Button>
          <Button onClick={install.accept}>
            <TerminalIcon aria-hidden strokeWidth={1.5} />
            Run it and install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Variant A: a list and a details pane side by side; Install opens a dialog with the choices.

function VariantA() {
  const [query, setQuery] = useState("");
  const list = matching(query);
  const [selected, setSelected] = useState(catalog[0]?.id ?? "");
  const plugin = catalog.find((candidate) => candidate.id === selected) ?? catalog[0];
  if (!plugin) return null;
  return (
    <VariantAPage
      query={query}
      onQuery={setQuery}
      list={list}
      plugin={plugin}
      onSelect={setSelected}
    />
  );
}

function VariantAPage({
  query,
  onQuery,
  list,
  plugin,
  onSelect,
}: {
  query: string;
  onQuery: (query: string) => void;
  list: Plugin[];
  plugin: Plugin;
  onSelect: (id: string) => void;
}) {
  const install = useInstall(plugin);
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="mx-auto flex h-full max-w-[64rem] flex-col px-6 pt-8 pb-16">
      <PageHeading />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,20rem)_1fr] border border-border">
        <div className="flex min-h-0 flex-col border-e border-border">
          <div className="p-2">
            <Search query={query} onQuery={onQuery} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Plugins">
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start hover:bg-muted",
                    item.id === plugin.id && "bg-accent",
                  )}
                  onClick={() => {
                    onSelect(item.id);
                  }}
                >
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <section
          className="flex min-w-0 flex-col gap-4 overflow-y-auto p-5"
          aria-label={plugin.name}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{plugin.name}</h2>
              <p className="text-xs text-muted-foreground">
                {plugin.marketplace} · {installsText(plugin)}
              </p>
            </div>
            <Button
              onClick={() => {
                setChoosing(true);
              }}
            >
              <DownloadIcon aria-hidden strokeWidth={1.5} />
              Install…
            </Button>
          </div>
          <p className="text-sm">{plugin.description}</p>
          <Facts plugin={plugin} />
          <Warning />
          <Outcome install={install} />
        </section>
      </div>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install {plugin.name}</DialogTitle>
            <DialogDescription>Who gets it?</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={install.scope}
            onValueChange={(value) => {
              install.setScope(value as Scope);
            }}
            aria-label="Who gets it"
          >
            {scopes.map((scope) => (
              <label key={scope.value} className="flex items-start gap-3 py-1">
                <RadioGroupItem value={scope.value} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm">{scope.label}</span>
                  <span className="text-xs text-muted-foreground">{scope.detail}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {install.scope === "user" ? null : <ProjectSelect install={install} />}
          <Warning />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChoosing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setChoosing(false);
                install.install();
              }}
            >
              Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TrustDialog install={install} />
      <CommandDialog plugin={plugin} install={install} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Variant B: one list; a row opens in place with the details and the choices inline, and a
// marketplace's command is confirmed inside the row.

function VariantB() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-[44rem] px-6 pt-8 pb-16">
      <PageHeading />
      <Search query={query} onQuery={setQuery} />
      <ul className="mt-3 divide-y divide-border border border-border" aria-label="Plugins">
        {matching(query).map((plugin) => (
          <RowB
            key={plugin.id}
            plugin={plugin}
            open={open === plugin.id}
            onToggle={() => {
              setOpen(open === plugin.id ? null : plugin.id);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function RowB({ plugin, open, onToggle }: { plugin: Plugin; open: boolean; onToggle: () => void }) {
  const install = useInstall(plugin);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted"
        onClick={onToggle}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {plugin.name}{" "}
            <span className="font-normal text-muted-foreground">· {plugin.marketplace}</span>
          </span>
          <span className="line-clamp-1 text-xs text-muted-foreground">{plugin.description}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{installsText(plugin)}</span>
        <ChevronRightIcon
          aria-hidden
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
          strokeWidth={1.5}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border bg-muted/30 px-4 py-4">
          <p className="text-sm">{plugin.description}</p>
          <Facts plugin={plugin} />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Who gets it</span>
            <RadioGroup
              value={install.scope}
              onValueChange={(value) => {
                install.setScope(value as Scope);
              }}
              className="flex flex-wrap gap-0"
              aria-label="Who gets it"
            >
              {scopes.map((scope) => (
                <RadioGroupButton key={scope.value} value={scope.value}>
                  {scope.label}
                </RadioGroupButton>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {scopes.find((scope) => scope.value === install.scope)?.detail}
            </p>
            {install.scope === "user" ? null : (
              <ProjectSelect install={install} className="max-w-[18rem]" />
            )}
          </div>
          <Warning />
          {install.step.kind === "command" ? (
            <div className="flex flex-col gap-2 border border-border bg-background p-3">
              <p className="text-xs">
                The {plugin.marketplace} marketplace asks to run this command to set the plugin up.
                Only this command runs.
              </p>
              <CommandBlock command={install.step.command} />
              <div className="flex gap-2">
                <Button size="sm" onClick={install.accept}>
                  Run it and install
                </Button>
                <Button size="sm" variant="outline" onClick={install.cancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => {
                  install.install();
                }}
              >
                <DownloadIcon aria-hidden strokeWidth={1.5} />
                Install
              </Button>
              <Outcome install={install} />
            </div>
          )}
          <TrustDialog install={install} />
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Variant C: a page per plugin, the details in a column and an install panel in numbered steps
// beside them.

function VariantC() {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const plugin = catalog.find((candidate) => candidate.id === shown);
  if (plugin) {
    return (
      <PluginPageC
        plugin={plugin}
        onBack={() => {
          setShown(null);
        }}
      />
    );
  }
  return (
    <div className="mx-auto max-w-[56rem] px-6 pt-8 pb-16">
      <PageHeading />
      <Search query={query} onQuery={setQuery} />
      <table className="mt-3 w-full border border-border text-sm">
        <thead className="text-start text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-start font-normal">Plugin</th>
            <th className="px-3 py-2 text-start font-normal">Marketplace</th>
            <th className="px-3 py-2 text-end font-normal">Installs</th>
          </tr>
        </thead>
        <tbody>
          {matching(query).map((item) => (
            <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted">
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-start font-medium underline-offset-4 hover:underline"
                  onClick={() => {
                    setShown(item.id);
                  }}
                >
                  {item.name}
                </button>
                <div className="line-clamp-1 text-xs text-muted-foreground">{item.description}</div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{item.marketplace}</td>
              <td className="px-3 py-2 text-end text-xs text-muted-foreground tabular-nums">
                {item.installs?.toLocaleString() ?? "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PluginPageC({ plugin, onBack }: { plugin: Plugin; onBack: () => void }) {
  const install = useInstall(plugin);
  return (
    <div className="mx-auto max-w-[56rem] px-6 pt-6 pb-16">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon aria-hidden strokeWidth={1.5} />
        All plugins
      </Button>
      <div className="mt-4 grid grid-cols-[1fr_18rem] items-start gap-8">
        <article className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{plugin.name}</h1>
            <p className="text-sm text-muted-foreground">
              from {plugin.marketplace} · version {plugin.version} · {installsText(plugin)}
            </p>
          </div>
          <p className="text-base">{plugin.description}</p>
          <div>
            <h2 className="pb-1 text-xs font-medium text-muted-foreground">Source</h2>
            <p className="font-mono text-xs break-all">{plugin.source}</p>
          </div>
          {plugin.shownCommand ? (
            <div>
              <h2 className="pb-1 text-xs font-medium text-muted-foreground">
                Runs when installed
              </h2>
              <CommandBlock command={plugin.shownCommand} />
            </div>
          ) : null}
        </article>
        <aside
          className="sticky top-6 flex flex-col gap-4 border border-border p-4"
          aria-label="Install"
        >
          <ol className="flex flex-col gap-4">
            <li className="flex flex-col gap-2">
              <span className="text-xs font-medium">1. Who gets it</span>
              <RadioGroup
                value={install.scope}
                onValueChange={(value) => {
                  install.setScope(value as Scope);
                }}
                aria-label="Who gets it"
              >
                {scopes.map((scope) => (
                  <label key={scope.value} className="flex items-start gap-2 text-sm">
                    <RadioGroupItem value={scope.value} className="mt-0.5" />
                    {scope.label}
                  </label>
                ))}
              </RadioGroup>
              {install.scope === "project" ? (
                <p className="text-xs text-muted-foreground">
                  {scopes.find((scope) => scope.value === "project")?.detail}
                </p>
              ) : null}
            </li>
            <li className={cn("flex flex-col gap-2", install.scope === "user" && "opacity-50")}>
              <span className="text-xs font-medium">2. Which project</span>
              {install.scope === "user" ? (
                <span className="text-xs text-muted-foreground">Every project</span>
              ) : (
                <ProjectSelect install={install} />
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-xs font-medium">3. Check</span>
              <Warning />
            </li>
          </ol>
          <Button
            onClick={() => {
              install.install();
            }}
          >
            <DownloadIcon aria-hidden strokeWidth={1.5} />
            Install
          </Button>
          <Outcome install={install} />
        </aside>
      </div>
      <TrustDialog install={install} />
      <CommandDialog plugin={plugin} install={install} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The switcher.

const variants = [
  { key: "A", name: "List and details pane, install dialog", component: VariantA },
  { key: "B", name: "Rows that open in place", component: VariantB },
  { key: "C", name: "A page per plugin, install steps", component: VariantC },
] as const;

export type VariantKey = (typeof variants)[number]["key"];

export function PluginsPrototype({
  variant,
  onVariant,
}: {
  variant: VariantKey;
  onVariant: (variant: VariantKey) => void;
}) {
  const at = variants.findIndex((candidate) => candidate.key === variant);
  const current = variants[at] ?? variants[0];
  const step = (by: number) => {
    const next = variants[(at + by + variants.length) % variants.length];
    if (next) onVariant(next.key);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });
  const Variant = current.component;
  return (
    <main className="relative h-full overflow-y-auto">
      <Variant key={current.key} />
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 bg-foreground px-2 py-1 text-xs text-background shadow-lg">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => {
            step(-1);
          }}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span>
          PROTOTYPE {current.key} ({current.name})
        </span>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => {
            step(1);
          }}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </main>
  );
}

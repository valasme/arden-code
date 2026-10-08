import { AgentMenu } from "@/features/sessions/AgentMenu";
import { EffortMenu } from "@/features/sessions/EffortMenu";
import { ModelMenu } from "@/features/sessions/ModelMenu";
import { ProjectMenu } from "@/features/sessions/ProjectMenu";

const projects = [
  {
    id: "playground",
    kind: "playground",
    name: "Playground",
    path: String.raw`C:\Users\Ada\AppData\Local\io.github.valasme.arden\playground`,
    trusted: true,
  },
  {
    id: "arden",
    kind: "folder",
    name: "arden-code",
    path: String.raw`C:\Work\arden-code`,
    trusted: true,
  },
] as const;

/** The lower line of an empty Claude session's message box, with its menus closed. */
export function MessageBoxChoicesSample() {
  return (
    <div
      data-message-choices-sample
      className="flex max-w-[45rem] flex-col border border-input bg-background"
    >
      <p className="px-3 pt-3 pb-1 text-base text-muted-foreground">Message Claude</p>
      <div className="flex flex-wrap items-center gap-1.5 ps-3 pe-2 pb-2 text-xs">
        <AgentMenu agent="claude" onChoose={() => {}} />
        <ProjectMenu
          projectId="arden"
          projects={projects}
          onChoose={() => {}}
          onOpenFolder={() => {}}
        />
        <ModelMenu model="opus" onChoose={() => {}} />
        <EffortMenu effort={null} ultrathink={false} onUltrathink={() => {}} onChoose={() => {}} />
      </div>
    </div>
  );
}

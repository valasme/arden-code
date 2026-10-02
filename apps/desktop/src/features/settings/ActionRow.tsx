import { Button } from "@/components/ui/button";

interface ActionRowProps {
  id: string;
  label: string;
  description: string;
  button: string;
  onClick: () => void;
}

/** Something to do rather than something to set: a name, what it does, and its button. */
export function ActionRow({ id, label, description, button, onClick }: ActionRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-48 flex-1 flex-col gap-0.5">
        <h3 id={`${id}-label`} className="text-sm font-medium">
          {label}
        </h3>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Button
        variant="outline"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        onClick={onClick}
      >
        {button}
      </Button>
    </div>
  );
}

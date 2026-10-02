import { RadioGroup, RadioGroupButton } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/** What every control needs to be named and described by its row. */
interface Described {
  /** The row's id: its label is `<id>-label` and its description is `<id>-description`. */
  id: string;
}

interface ChoiceProps<Value extends string> extends Described {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}

/** One choice out of a few, as a row of joined buttons that is one radio group. */
export function ChoiceControl<Value extends string>({
  id,
  value,
  options,
  onChange,
}: ChoiceProps<Value>) {
  return (
    <RadioGroup
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className="flex w-auto flex-wrap gap-0"
      value={value}
      onValueChange={(next) => {
        const chosen = options.find((option) => option.value === next);
        if (chosen) onChange(chosen.value);
      }}
    >
      {options.map((option) => (
        <RadioGroupButton key={option.value} value={option.value} id={`${id}-${option.value}`}>
          {option.label}
        </RadioGroupButton>
      ))}
    </RadioGroup>
  );
}

interface ToggleProps extends Described {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** On or off. */
export function ToggleControl({ id, checked, onChange }: ToggleProps) {
  return (
    <Switch
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      checked={checked}
      onCheckedChange={onChange}
    />
  );
}

interface RangeProps extends Described {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Says a value the way people read it, such as "110%". */
  format: (value: number) => string;
  /** Called on every step of a drag, to show the value before it is saved. */
  onPreview: (value: number) => void;
  /** Called when a drag ends, and for every key press, to save the value. */
  onCommit: (value: number) => void;
}

/** A number between two limits, chosen with a slider, and shown beside it. */
export function RangeControl({
  id,
  value,
  min,
  max,
  step,
  format,
  onPreview,
  onCommit,
}: RangeProps) {
  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        getValueText={format}
        className="w-40"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onPreview(next);
        }}
        onValueCommit={([next]) => {
          if (next !== undefined) onCommit(next);
        }}
      />
      {/* The slider announces its value itself; this is for people who can see it. */}
      <span aria-hidden className="w-12 text-end text-xs whitespace-nowrap tabular-nums">
        {format(value)}
      </span>
    </div>
  );
}

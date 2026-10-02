"use client";

import * as React from "react";
import { cn } from "cn";
import { Slider as SliderPrimitive } from "radix-ui";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  getValueText,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Says a value in words for a screen reader, such as "110%". */
  getValueText?: (value: number) => string;
}) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(value === undefined ? {} : { value })}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-none bg-input forced-colors:bg-[CanvasText] data-horizontal:h-0.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-0.5"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-foreground select-none forced-colors:bg-[Highlight] data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-valuetext={
            getValueText && _values[index] !== undefined ? getValueText(_values[index]) : undefined
          }
          className="relative block h-4 w-2 shrink-0 rounded-none border border-foreground bg-background select-none after:absolute after:-inset-2 disabled:pointer-events-none disabled:opacity-50 forced-colors:border-[CanvasText]"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };

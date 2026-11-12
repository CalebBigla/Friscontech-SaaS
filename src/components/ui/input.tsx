import * as React from "react";

import { cn } from "@/lib/utils";
import { caretAfterFormat, formatNumberInput, parseNumberInput } from "@/lib/number-input";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Field styling with motion: a soft glow on focus and a brief pulse on each
 * keystroke (data-typing), both off for people who ask for reduced motion.
 */
const fieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-[border-color,box-shadow,background-color] duration-200 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[typing]:ring-[4px] data-[typing]:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none md:text-sm";

/** Marks the field as "typing" for a moment after each keystroke, without re-rendering. */
function useTypingPulse(forwarded: React.ForwardedRef<HTMLInputElement>) {
  const inner = React.useRef<HTMLInputElement | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const setRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof forwarded === "function") forwarded(el);
      else if (forwarded) forwarded.current = el;
    },
    [forwarded],
  );
  const pulse = React.useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.dataset["typing"] = "";
    clearTimeout(timer.current);
    timer.current = setTimeout(() => delete el.dataset["typing"], 320);
  }, []);
  return { inner, setRef, pulse };
}

const TextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onInput, ...props }, ref) => {
    const { setRef, pulse } = useTypingPulse(ref);
    return (
      <input
        type={type}
        className={cn(fieldClass, className)}
        ref={setRef}
        onInput={(e) => {
          pulse();
          onInput?.(e);
        }}
        {...props}
      />
    );
  },
);
TextInput.displayName = "TextInput";

/**
 * type="number" fields: shown with thousands separators (3,000,000) while the form
 * receives the plain value ("3000000") in e.target.value, exactly as before. Whole
 * numbers only when inputMode="numeric" or step={1}; otherwise one decimal point.
 */
const NumberInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, onChange, onInput, inputMode, step, min: _min, max: _max, type: _type, ...props }, ref) => {
    const { inner, setRef, pulse } = useTypingPulse(ref);
    const allowDecimal = !(inputMode === "numeric" || step === 1 || step === "1");
    const display = formatNumberInput(parseNumberInput(value === undefined || value === null ? "" : String(value), allowDecimal));
    const caret = React.useRef<number | null>(null);

    useIsomorphicLayoutEffect(() => {
      const el = inner.current;
      if (caret.current === null || !el || el !== document.activeElement) return;
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    });

    return (
      <input
        {...props}
        ref={setRef}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        autoComplete={props.autoComplete ?? "off"}
        className={cn(fieldClass, "tabular-nums", className)}
        value={display}
        onInput={(e) => {
          pulse();
          onInput?.(e);
        }}
        onChange={(e) => {
          const typed = e.target.value;
          const raw = parseNumberInput(typed, allowDecimal);
          caret.current = caretAfterFormat(typed, e.target.selectionStart ?? typed.length, formatNumberInput(raw), allowDecimal);
          // Hand the form the plain number; everything else about the event is unchanged.
          const target = Object.create(e.target, { value: { value: raw } }) as HTMLInputElement;
          onChange?.(Object.create(e, { target: { value: target }, currentTarget: { value: target } }) as React.ChangeEvent<HTMLInputElement>);
        }}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>((props, ref) =>
  props.type === "number" ? <NumberInput ref={ref} {...props} /> : <TextInput ref={ref} {...props} />,
);
Input.displayName = "Input";

export { Input };

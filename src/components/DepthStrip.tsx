import { useEffect, useRef } from "react";
import { STAGE_LABEL, stageClass } from "../lib/constants";
import { percent, type Funnel } from "../lib/analytics";
import type { Stage } from "../lib/types";
import { cx } from "./ui";

/** A sounding figure. Remounted when its count changes; whether it settles is fixed at mount. */
function Figure({ count, settle }: { count: number; settle: boolean }) {
  const animate = useRef(settle).current;
  return (
    <span className={cx("block text-[32px] font-bold leading-none tracking-[-0.02em] lg:text-[44px]",
      animate && "animate-[figure-settle_420ms_var(--ease-out)]")}>
      {count}
    </span>
  );
}

/**
 * The depth profile: eight stages as one strip that gets deeper in blue.
 * The big figure is how many prospects sit in the stage now; the pill between
 * two stages is the share that made it from one to the next.
 */
export function DepthStrip({ funnel, active, onSelect, counts }: {
  funnel: Funnel;
  active?: Stage | null;
  onSelect?: (stage: Stage | null) => void;
  /** Override the big figure (for example, counts under the current filters). */
  counts?: Partial<Record<Stage, number>>;
}) {
  // The settle plays when a count changes, not when the page first loads.
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  return (
    <div className="grid grid-cols-4 gap-y-1 overflow-hidden rounded-[16px] shadow-soft lg:flex lg:gap-0 lg:overflow-visible lg:shadow-none">
      {funnel.steps.map((step, i) => {
        const weakest = funnel.weakest === i;
        const selected = active === step.stage;
        const count = counts?.[step.stage] ?? step.current;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={step.stage}
            {...(onSelect ? {
              type: "button" as const,
              onClick: () => onSelect(selected ? null : step.stage),
              "aria-pressed": selected,
              title: selected ? "Show all stages" : `Show only ${STAGE_LABEL[step.stage]}`,
            } : {})}
            className={cx(
              "group relative flex h-[104px] flex-col items-center justify-center text-center transition-[filter,box-shadow] duration-150 lg:h-[108px] lg:flex-1",
              stageClass(step.stage),
              i === 0 && "lg:rounded-l-[16px]", i === funnel.steps.length - 1 && "lg:rounded-r-[16px]",
              onSelect && "cursor-pointer hover:brightness-[1.04]",
              selected && "z-[3] shadow-[inset_0_0_0_3px_var(--color-navy)]",
              active && !selected && "opacity-60",
            )}
          >
            <Figure key={count} count={count} settle={mounted.current} />
            <span className="mt-1 block text-[12.5px] font-medium italic lg:mt-1.5 lg:text-[13.5px]">{STAGE_LABEL[step.stage]}</span>
            {/* Phones: the conversion sits under the stage name instead of on the boundary.
                The last stage keeps an empty slot so the row shares one baseline. */}
            <span className={cx("mt-1 h-[18px] whitespace-nowrap rounded-full px-1.5 text-[11.5px] font-bold leading-[18px] lg:hidden",
              step.conversion == null ? "invisible" : weakest ? "bg-magenta text-white" : "bg-card/85 text-navy")}>
              {step.conversion != null && <>{percent(step.conversion)} on{weakest && <span className="sr-only">, the weakest step</span>}</>}
            </span>
            {step.conversion != null && (
              <span
                className={cx(
                  "absolute right-0 top-1/2 z-[2] hidden -translate-y-1/2 translate-x-1/2 rounded-full px-2.5 py-1.5 text-[16px] font-bold leading-none shadow-soft lg:block",
                  weakest ? "bg-magenta text-white" : "bg-card text-navy",
                )}
                title={`${percent(step.conversion)} of prospects that reached ${STAGE_LABEL[step.stage]} went on to ${STAGE_LABEL[funnel.steps[i + 1].stage]}`}
              >
                {percent(step.conversion)}
                {weakest && (
                  <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-magenta px-2 py-[3px] text-[10.5px] font-bold">
                    Weakest step
                  </span>
                )}
              </span>
            )}
          </Tag>
        );
      })}
      <style>{`@keyframes figure-settle{from{opacity:.25;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

import { STAGE_LABEL, stageClass } from "../lib/constants";
import { percent, type Funnel } from "../lib/analytics";
import type { Stage } from "../lib/types";
import { cx } from "./ui";

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
              "group relative flex h-[92px] flex-col items-center justify-center text-center transition-[filter,box-shadow] duration-150 lg:h-[108px] lg:flex-1",
              stageClass(step.stage),
              i === 0 && "lg:rounded-l-[16px]", i === funnel.steps.length - 1 && "lg:rounded-r-[16px]",
              onSelect && "cursor-pointer hover:brightness-[1.04]",
              selected && "z-[3] shadow-[inset_0_0_0_3px_var(--color-navy)]",
              active && !selected && "opacity-60",
            )}
          >
            <span key={count} className="block animate-[figure-settle_420ms_var(--ease-out)] text-[34px] font-bold leading-none tracking-[-0.02em] lg:text-[44px]">
              {count}
            </span>
            <span className="mt-1.5 block text-[12.5px] font-medium italic lg:text-[13.5px]">{STAGE_LABEL[step.stage]}</span>
            {step.conversion != null && (
              <span
                className={cx(
                  "absolute right-0 top-1/2 z-[2] hidden -translate-y-1/2 translate-x-1/2 rounded-full px-2.5 py-1 text-[13px] font-bold leading-none shadow-soft lg:block",
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
            {weakest && <span className="absolute right-1.5 top-1.5 rounded-full bg-magenta px-1.5 py-px text-[10px] font-bold text-white lg:hidden">Weakest {percent(step.conversion)}</span>}
          </Tag>
        );
      })}
      <style>{`@keyframes figure-settle{from{opacity:.25;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

import { UiIcon } from "@/components/UiIcon";

/** The visited mark: an ink circle with a check (never green); not yet visited is the same size, an empty dashed circle. */
export function VisitMark({ done, className = "" }: { done: boolean; className?: string }) {
  return done ? (
    <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--foreground)] text-[var(--card-bg)] ${className}`}>
      <UiIcon name="check" size={12} />
    </span>
  ) : (
    <span aria-hidden="true" className={`h-5 w-5 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--muted)] ${className}`} />
  );
}

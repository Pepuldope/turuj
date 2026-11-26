/** The visitor's own rating as five small stars, theirs filled in (Peter, 26 Nov 2026: never the word "ohodnotené"). Say the number beside it for screen readers. */
export function MyStars({ stars, className = "" }: { stars: number; className?: string }) {
  return (
    <span aria-hidden="true" data-my-stars={stars} className={`inline-flex text-[15px] leading-none tracking-[1px] ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= stars ? "text-[#f5b301]" : "text-[var(--border)]"}>
          ★
        </span>
      ))}
    </span>
  );
}

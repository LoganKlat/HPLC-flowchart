/** Next change sits in the right column, flush with the rules table. */
export const decisionBesideClass =
  "@container @min-[26rem]:col-start-2 @min-[26rem]:row-start-1 @min-[26rem]:h-full @min-[26rem]:self-stretch @min-[26rem]:rounded-l-none @min-[26rem]:ring-0 @min-[26rem]:border @min-[26rem]:border-foreground/10";

/** Why and the rest of the decision span the table and the Next change box. */
export const decisionUnderClass = "@min-[26rem]:col-span-2";

/** The decided value fills the Next change box, on one line. */
export const nextChangeValueClass =
  "flex w-full min-w-0 flex-1 items-center justify-center text-center font-heading font-bold leading-none whitespace-nowrap text-[clamp(1.2rem,11cqw,2.25rem)]";

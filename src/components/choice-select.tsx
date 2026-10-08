import { cn } from "cn";

const choiceClass =
  "h-10 w-full appearance-auto rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ChoiceSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  placeholderInList = true,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  /** When false, the empty prompt stays on the closed control and is not a listed choice. */
  placeholderInList?: boolean;
  className?: string;
}) {
  const known = options.some((option) => option.value === value);
  return (
    <select id={id} className={cn(choiceClass, className)} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled={!placeholderInList} hidden={!placeholderInList}>
        {placeholder}
      </option>
      {!known && value.trim() ? <option value={value}>{value}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

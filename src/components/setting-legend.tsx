import { kindLabel, type SettingKind } from "@/lib/setting-kind";

export function KindMark({ kind }: { kind: SettingKind }) {
  return (
    <span className="inline-flex rounded-full bg-[var(--hp-gold-soft)] px-2 py-0.5 text-xs font-medium text-[var(--hp-gold-ink)]">
      {kindLabel(kind)}
    </span>
  );
}

import { kindLabel, type SettingKind } from "@/lib/setting-kind";

export function KindMark({ kind }: { kind: SettingKind }) {
  return (
    <span className="inline-flex rounded-full bg-[#efe6c4] px-2 py-0.5 text-xs font-medium text-[#3d3416]">
      {kindLabel(kind)}
    </span>
  );
}

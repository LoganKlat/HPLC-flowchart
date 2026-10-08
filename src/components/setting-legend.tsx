import { kindLabel, SETTING_MARKS, type SettingKind } from "@/lib/setting-kind";

export function KindMark({ kind }: { kind: SettingKind }) {
  return (
    <span className="inline-flex rounded-full bg-[#efe6c4] px-2 py-0.5 text-xs font-medium text-[#3d3416]">
      {kindLabel(kind)}
    </span>
  );
}

export function SettingLegend() {
  return (
    <aside id="setting-legend" className="rounded-xl bg-[#e7f3ee] px-4 py-3 text-sm leading-relaxed text-[#144237]">
      <p className="font-medium">Mechanical or chemical</p>
      <p className="mt-1">
        Mechanical settings move the instrument. Chemical settings change the liquid or the coating.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {SETTING_MARKS.map((setting) => (
          <li key={setting.id} className="flex flex-wrap items-center gap-2">
            <span>{setting.label}</span>
            <KindMark kind={setting.kind} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

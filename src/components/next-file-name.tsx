"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function NextFileNameLine({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      const area = document.createElement("textarea");
      area.value = name;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
  }

  return (
    <div id="next-file-name" className="mt-3 flex flex-col gap-2 border-t border-foreground/15 pt-3">
      <p className="min-w-0 text-sm leading-snug text-foreground">
        File name for the next run:{" "}
        <span id="next-file-name-value" className="font-mono text-[0.8rem]">
          {name.split("-").map((piece, index, pieces) => (
            <span key={index}>
              <span className="whitespace-nowrap" data-piece="">
                {piece}
              </span>
              {index < pieces.length - 1 ? (
                <>
                  -<wbr />
                </>
              ) : null}
            </span>
          ))}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" id="copy-file-name" variant="outline" className="h-8 px-3 text-xs" onClick={() => void copyName()}>
          Copy name
        </Button>
        {copied ? (
          <p className="text-xs text-muted-foreground" role="status">
            Copied
          </p>
        ) : null}
      </div>
    </div>
  );
}

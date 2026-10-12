import { readLabFile } from "./lab-file";

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ read: readLabFile(event.data) });
  } catch {
    self.postMessage({ error: "This file could not be read." });
  }
};

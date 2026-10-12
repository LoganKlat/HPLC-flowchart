import type { LabFileRead } from "./lab-file";

/** Parse locally in a worker; transferring the buffer avoids another copy. */
export function readLabFileAsync(buffer: ArrayBuffer, signal: AbortSignal): Promise<LabFileRead> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./lab-file.worker.ts", import.meta.url), { type: "module" });
    function cleanup() {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    }
    function abort() {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ read?: LabFileRead; error?: string }>) => {
      cleanup();
      if (event.data.read) resolve(event.data.read);
      else reject(new Error(event.data.error ?? "This file could not be read."));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The file reader could not start. Refresh the page and try again."));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("The file reader could not return the results. Please try again."));
    };
    try {
      worker.postMessage(buffer, [buffer]);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

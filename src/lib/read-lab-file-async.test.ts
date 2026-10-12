import { afterEach, describe, expect, it, vi } from "vitest";
import { readLabFileAsync } from "./read-lab-file-async";

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.latest = this; }
}
afterEach(() => vi.unstubAllGlobals());
describe("background uploads", () => {
  it("transfers the buffer and releases the worker after returning results", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const buffer = new ArrayBuffer(8);
    const pending = readLabFileAsync(buffer, new AbortController().signal);
    const worker = FakeWorker.latest;
    expect(worker.postMessage).toHaveBeenCalledWith(buffer, [buffer]);
    const read = { peakCount: 7 };
    worker.onmessage!({ data: { read } });
    expect(await pending).toEqual(read);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates parsing when a run is cleared", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const pending = readLabFileAsync(new ArrayBuffer(8), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it("reports worker startup errors and releases resources", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const pending = readLabFileAsync(new ArrayBuffer(8), new AbortController().signal);
    FakeWorker.latest.onerror!();
    await expect(pending).rejects.toThrow("could not start");
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it("does not start parsing an already cancelled upload", async () => {
    const Worker = vi.fn();
    vi.stubGlobal("Worker", Worker);
    const controller = new AbortController();
    controller.abort();
    await expect(readLabFileAsync(new ArrayBuffer(8), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(Worker).not.toHaveBeenCalled();
  });
});

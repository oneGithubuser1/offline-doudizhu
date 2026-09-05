import type { AiDecision, AiView } from "./strategy";

export interface AiReply {
  id: number;
  bid?: number;
  decision?: AiDecision;
  engine?: "douzero" | "rules";
  error?: string;
}

// One worker per table, with request IDs so a late reply from a restarted round
// cannot be applied to the new round or to a different seat.
export class AiWorkerClient {
  private worker: Worker | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve: (reply: AiReply) => void; reject: (error: Error) => void; timer: number }>();

  request(phase: string, view: AiView): Promise<AiReply> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<AiReply>) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(event.data.id);
        pending.resolve(event.data);
      };
      this.worker.onerror = () => this.dispose();
    }
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => this.dispose(), 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, phase, view, assetBase: new URL("./", document.baseURI).href });
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("AI worker unavailable or timed out"));
    }
    this.pending.clear();
  }
}

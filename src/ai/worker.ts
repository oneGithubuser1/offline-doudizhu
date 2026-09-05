import { chooseBid, choosePlay, type AiView } from "./strategy";
import { env } from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import wasmModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import { createNeuralAgent } from "./neural";

env.wasm.numThreads = 1;
env.wasm.proxy = false;
env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(wasmModuleUrl, self.location.href).href,
};
env.logLevel = "error";
let assetBase = "";
const agent = createNeuralAgent(seat => new Promise((resolve, reject) => {
  // XHR also works with Electron's offline file:// origin; fetch does not.
  const request = new XMLHttpRequest();
  request.open("GET", new URL(`models/${seat}.onnx`, assetBase).href);
  request.responseType = "arraybuffer";
  request.timeout = 15_000;
  request.onload = () => {
    if ((request.status === 0 || request.status === 200) && request.response?.byteLength) {
      resolve(new Uint8Array(request.response));
    } else reject(new Error(`Offline model unavailable (${request.status})`));
  };
  request.onerror = request.ontimeout = () => reject(new Error("Offline model could not be loaded"));
  request.send();
}));

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; phase: string; view: AiView; assetBase: string }>) => {
  const message = event.data;
  queue = queue.then(async () => {
    const { id, phase, view } = message;
    assetBase = message.assetBase;
    if (phase === "bidding") {
      self.postMessage({ id, bid: chooseBid(view.hand, view.highestBid) });
      return;
    }
    try {
      self.postMessage({ id, decision: await agent.choose(view), engine: "douzero" });
    } catch (error) {
      self.postMessage({ id, decision: choosePlay(view), engine: "rules",
        error: error instanceof Error ? error.message : String(error) });
    }
  }).catch(error => self.postMessage({ id: message.id, error: String(error), engine: "rules" }));
};

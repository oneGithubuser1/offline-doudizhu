import { chooseBid, choosePlay, type AiView } from "./strategy";

self.onmessage = (event: MessageEvent<{ phase: string; view: AiView }>) => {
  const { phase, view } = event.data;
  self.postMessage(phase === "bidding"
    ? { bid: chooseBid(view.hand, view.highestBid) }
    : { decision: choosePlay(view) });
};

import type { PlayPattern } from "../core/patterns";

const clipModules = import.meta.glob("../assets/voice/*.wav", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

let enabled = true;
let generation = 0;
let queue: Promise<void> = Promise.resolve();
let currentAudio: HTMLAudioElement | null = null;
let cueContext: AudioContext | null = null;

function clipUrl(name: string): string | null {
  return clipModules[`../assets/voice/${name}.wav`] ?? null;
}

function enqueue(task: () => Promise<void>): void {
  const taskGeneration = generation;
  queue = queue
    .then(() => (enabled && taskGeneration === generation ? task() : Promise.resolve()))
    .catch(() => undefined);
}

function playClip(name: string): Promise<void> {
  const url = clipUrl(name);
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.volume = 0.88;
    const finish = () => {
      if (currentAudio === audio) currentAudio = null;
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    void audio.play().catch(finish);
  });
}

export function announcementName(pattern: PlayPattern): string {
  if (pattern.type === "single") return `single-${pattern.mainRank}`;
  if (pattern.type === "pair") return `pair-${pattern.mainRank}`;
  if (pattern.type === "triple") return `triple-${pattern.mainRank}`;
  if (pattern.type === "triple_single") return "triple-single";
  if (pattern.type === "triple_pair") return "triple-pair";
  if (pattern.type === "straight") return "straight";
  if (pattern.type === "pair_straight") return "pair-straight";
  if (pattern.type === "triple_straight") return "airplane";
  if (pattern.type === "airplane_single" || pattern.type === "airplane_pair") return "airplane-wing";
  if (pattern.type === "four_two_single") return "four-two";
  if (pattern.type === "four_two_pair") return "four-two-pair";
  return pattern.type;
}

function ensureCueContext(): AudioContext | null {
  if (cueContext) return cueContext;
  if (!window.AudioContext) return null;
  cueContext = new AudioContext();
  return cueContext;
}

function tone(
  audio: AudioContext,
  frequency: number,
  when: number,
  duration: number,
  volume: number,
  wave: OscillatorType,
): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.03);
}

async function playResultChime(won: boolean): Promise<void> {
  const audio = ensureCueContext();
  if (!audio) return;
  try {
    if (audio.state === "suspended") await audio.resume();
  } catch {
    return;
  }
  const start = audio.currentTime + 0.04;
  const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66, 261.63];
  notes.forEach((frequency, index) => {
    tone(audio, frequency, start + index * (won ? 0.12 : 0.16), won ? 0.42 : 0.5, 0.09, won ? "triangle" : "sine");
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, won ? 850 : 1050));
}

export function setVoiceEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  generation += 1;
  currentAudio?.pause();
  currentAudio = null;
  queue = Promise.resolve();
}

export async function unlockVoice(): Promise<void> {
  if (!enabled) return;
  const audio = ensureCueContext();
  if (!audio) return;
  try {
    if (audio.state === "suspended") await audio.resume();
  } catch {
    // A later user action gets another chance to unlock audio.
  }
}

export function announcePlay(pattern: PlayPattern): void {
  enqueue(() => playClip(announcementName(pattern)));
}

export function announceRemaining(playerIndex: number, count: 1 | 2): void {
  const speaker = playerIndex === 1 ? "river" : "forest";
  enqueue(() => playClip(`${speaker}-${count === 1 ? "one" : "two"}`));
}

export function playRoundResult(won: boolean): void {
  enqueue(() => playResultChime(won));
}

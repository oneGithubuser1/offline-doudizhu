import { BPM, BEATS_PER_LOOP, makeScore, type Instrument, type Note } from "./score";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let timer: number | null = null;
let enabled = false;
let volume = .45;
let cursor = 0;
let loopStart = 0;
const beatSeconds = 60 / BPM;
const score = makeScore();
const samples = new Map<string, AudioBuffer>();

function ensureAudio(): AudioContext | null {
  if (context) return context;
  if (!window.AudioContext) return null;
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = enabled ? .8 : 0;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 20;
  compressor.ratio.value = 2.5;
  master.connect(compressor).connect(context.destination);
  musicBus = context.createGain();
  musicBus.gain.value = volume * .72;
  musicBus.connect(master);
  reverb = context.createConvolver();
  const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 1.15), context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const buffer = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < buffer.length; i++) {
      smooth = smooth * .68 + (Math.random() * 2 - 1) * .32;
      buffer[i] = smooth * Math.exp(-i / context.sampleRate * 6);
    }
  }
  reverb.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = .17;
  reverb.connect(wet).connect(musicBus);
  loopStart = context.currentTime + .12;
  return context;
}

function sample(instrument: Instrument, midi: number): AudioBuffer {
  const audio = context!;
  const key = instrument + midi;
  const cached = samples.get(key);
  if (cached) return cached;
  const seconds = instrument === "brush" ? .35 : instrument === "bass" ? 2 : 3.8;
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  const freq = 440 * 2 ** ((midi - 69) / 12);
  let noise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / audio.sampleRate;
    const attack = 1 - Math.exp(-t * (instrument === "piano" ? 320 : 160));
    if (instrument === "brush") {
      const next = Math.random() * 2 - 1;
      data[i] = (next - noise) * Math.exp(-t * 19) * attack;
      noise = next;
    } else if (instrument === "bass") {
      data[i] = (Math.sin(2 * Math.PI * freq * t) * .8 + Math.sin(4 * Math.PI * freq * t) * .18 * Math.exp(-t * 9)) * attack * Math.exp(-t * 2.7);
    } else {
      let value = 0;
      for (let partial = 1; partial <= 5; partial++) {
        const amplitude = [.68, .2, .085, .024, .012][partial - 1];
        const decay = 1.25 + partial * .58 + Math.max(0, midi - 60) * .018;
        const angle = 2 * Math.PI * freq * partial * (1 + partial * partial * .000035) * t;
        value += amplitude * (Math.sin(angle) + Math.sin(angle * 1.0009) * .28) * Math.exp(-t * decay);
      }
      data[i] = value * attack;
    }
  }
  samples.set(key, buffer);
  return buffer;
}

function playNote(note: Note, when: number): void {
  if (!context || !musicBus || !reverb) return;
  const source = context.createBufferSource();
  source.buffer = sample(note.instrument, note.midi);
  const gain = context.createGain();
  const pan = context.createStereoPanner();
  pan.pan.value = note.pan;
  const length = note.duration * beatSeconds;
  gain.gain.setValueAtTime(note.velocity, when);
  gain.gain.setValueAtTime(note.velocity, when + length);
  gain.gain.exponentialRampToValueAtTime(.0001, when + length + .28);
  source.connect(gain).connect(pan).connect(musicBus);
  if (note.instrument === "piano") pan.connect(reverb);
  source.start(when);
  source.stop(when + length + .32);
  source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); };
}

function schedule(): void {
  if (!enabled || !context) return;
  // Advance musical time after a background-tab delay; never play missed notes in a burst.
  while (true) {
    const note = score[cursor];
    const when = loopStart + note.beat * beatSeconds;
    if (when > context.currentTime + .4) break;
    if (when >= context.currentTime + .008) playNote(note, when);
    cursor++;
    if (cursor >= score.length) {
      cursor = 0;
      loopStart += BEATS_PER_LOOP * beatSeconds;
    }
    if (loopStart + BEATS_PER_LOOP * beatSeconds < context.currentTime) {
      loopStart += Math.floor((context.currentTime - loopStart) / (BEATS_PER_LOOP * beatSeconds)) * BEATS_PER_LOOP * beatSeconds;
    }
  }
}

export async function unlockBgm(): Promise<void> {
  if (!enabled) return;
  const audio = ensureAudio();
  if (!audio) return;
  try { if (audio.state === "suspended") await audio.resume(); } catch { return; }
  schedule();
  if (timer === null) timer = window.setInterval(schedule, 100);
}

export function setBgmEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  if (!value) {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    master?.gain.setTargetAtTime(.0001, context?.currentTime ?? 0, .12);
  } else {
    if (context && master) {
      master.gain.setTargetAtTime(.8, context.currentTime, .2);
      // Continue the phrase at the next unscheduled note on re-enable.
      loopStart = context.currentTime + .12 - score[cursor].beat * beatSeconds;
    }
  }
}

export function setMusicVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
  if (musicBus && context) musicBus.gain.setTargetAtTime(volume * .72, context.currentTime, .1);
}

export async function playImpactSound(rocket: boolean): Promise<void> {
  if (!enabled) return;
  const audio = ensureAudio();
  if (!audio || !master) return;
  try { if (audio.state === "suspended") await audio.resume(); } catch { return; }
  const when = audio.currentTime + .38;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(rocket ? 150 : 100, when);
  oscillator.frequency.exponentialRampToValueAtTime(38, when + .4);
  gain.gain.setValueAtTime(.0001, when);
  gain.gain.exponentialRampToValueAtTime(rocket ? .21 : .16, when + .018);
  gain.gain.exponentialRampToValueAtTime(.0001, when + .48);
  oscillator.connect(gain).connect(master);
  oscillator.start(when); oscillator.stop(when + .5);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  if (rocket) {
    [72, 79, 84].forEach((midi, i) => playNote({ beat: 0, midi, duration: .4, velocity: .42, instrument: "piano", pan: 0 }, when + i * .09));
  }
}

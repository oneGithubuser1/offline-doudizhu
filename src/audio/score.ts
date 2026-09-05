// Original 32-bar AABA miniature, in C major. Positions and lengths are in beats.
export type Instrument = "piano" | "bass" | "brush";
export interface Note { beat: number; midi: number; duration: number; velocity: number; instrument: Instrument; pan: number }
export const BPM = 88;
export const BEATS_PER_LOOP = 128;
const A: Array<Array<[number, number, number]>> = [
  [[.5, 67, .65], [1.5, 72, .55], [2.5, 76, .85]],
  [[0, 74, .9], [1.5, 72, .5], [2.5, 69, 1]],
  [[.5, 65, .6], [1.5, 69, .55], [2.5, 72, .55], [3.25, 71, .4]],
  [[0, 67, 1.6], [2.75, 62, .7]],
  [[0, 64, .75], [1.5, 67, .5], [2.5, 71, .85]],
  [[.5, 69, 1.25], [2.5, 67, .5], [3.25, 64, .45]],
  [[0, 65, .8], [1.5, 62, .6], [2.5, 67, .65]],
  [[0, 64, 2.25]],
];
const B: Array<Array<[number, number, number]>> = [
  [[.5, 69, .7], [1.5, 72, .6], [2.5, 76, 1]],
  [[0, 74, .6], [1, 71, .65], [2.5, 67, 1.1]],
  [[.5, 72, .6], [1.5, 76, .65], [2.5, 79, .8]],
  [[0, 77, 1.2], [2.5, 76, .6]],
  [[0, 74, .8], [1.5, 72, .6], [2.75, 69, .75]],
  [[.5, 71, .7], [1.5, 74, .55], [2.5, 72, 1]],
  [[0, 69, .8], [1.5, 65, .6], [2.5, 62, .8]],
  [[.5, 67, 2.3]],
];
const chords = [
  [48, 55, 59, 64], [45, 55, 60, 64], [50, 57, 60, 65], [43, 53, 59, 64],
  [52, 55, 59, 62], [45, 55, 60, 64], [50, 57, 60, 65], [43, 53, 59, 62],
  [48, 55, 59, 64], [45, 55, 60, 64], [50, 57, 60, 65], [43, 53, 59, 64],
  [52, 55, 59, 62], [45, 55, 60, 64], [50, 57, 60, 65], [48, 55, 59, 64],
  [53, 57, 60, 64], [47, 57, 62, 65], [52, 55, 59, 64], [45, 55, 61, 64],
  [50, 57, 60, 65], [43, 53, 59, 64], [50, 57, 60, 65], [43, 53, 59, 62],
  [48, 55, 59, 64], [45, 55, 60, 64], [50, 57, 60, 65], [43, 53, 59, 64],
  [52, 55, 59, 62], [45, 55, 60, 64], [50, 57, 60, 65], [48, 55, 59, 64],
];
function humanize(index: number): number { return Math.sin(index * 17.13) * .012; }
function swing(beat: number): number { return beat % 1 === .5 ? beat + .065 : beat; }
export function makeScore(): Note[] {
  const notes: Note[] = [];
  const add = (bar: number, beat: number, midi: number, duration: number, velocity: number, instrument: Instrument, pan = 0) => {
    const index = notes.length;
    notes.push({ beat: Math.max(0, bar * 4 + swing(beat) + humanize(index)), midi, duration,
      velocity: velocity * (1 + Math.sin(index * 2.73) * .08), instrument, pan });
  };
  for (let bar = 0; bar < 32; bar++) {
    const chord = chords[bar];
    const phrase = bar >= 16 && bar < 24 ? B : A;
    for (const [beat, midi, length] of phrase[bar % 8]) {
      add(bar, beat, midi, length, .43 + (beat % 1 ? -.04 : .02), "piano", .16);
    }
    // Sparse, softly rolled chord voicings leave room between the melody phrases.
    for (const beat of bar % 4 === 3 ? [0] : [.05, 2.25]) {
      chord.slice(1).forEach((midi, i) => add(bar, beat + i * .035, midi, 1.45, .18, "piano", -.24));
    }
    add(bar, 0, chord[0] - 12, 1.4, .52, "bass", -.08);
    add(bar, 2, chord[0] - 5, 1.1, .34, "bass", -.08);
    if (bar % 4 === 2) add(bar, 3.5, chords[(bar + 1) % 32][0] - 13, .38, .22, "bass", -.08);
    // An understated brush on the backbeat, with a quieter offbeat.
    add(bar, 1, 0, .17, .06, "brush", -.32);
    add(bar, 3, 0, .23, .07, "brush", .28);
    if (bar % 4 !== 3) add(bar, 3.5, 0, .08, .025, "brush", .3);
  }
  return notes.sort((a, b) => a.beat - b.beat);
}

import { computeGap, type PauseSettings } from './gap';
import type { EngineSegment } from './types';

/** Text weight for audio calibration, never a standalone duration or word timing. */
function textSeconds(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const words = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return cjk.length / 5 + words.length / 3;
}

/** Prefix updates and sums in logarithmic time; refreshing a novel never walks its sentences. */
class Sums {
  private readonly values: Float64Array;
  constructor(length: number) { this.values = new Float64Array(length + 1); }
  add(index: number, value: number): void {
    for (let i = index + 1; i < this.values.length; i += i & -i) this.values[i] += value;
  }
  private prefix(end: number): number {
    let sum = 0;
    for (let i = end; i > 0; i -= i & -i) sum += this.values[i];
    return sum;
  }
  range(from: number, to: number): number { return this.prefix(to) - this.prefix(from); }
}

/** One voice over one segment list. Audio measurements outlive decoded clip eviction. */
export class RemainingTime {
  private readonly base: Float64Array;
  private readonly paragraphs: Uint32Array;
  private readonly knownBase: Sums;
  private readonly knownSeconds: Sums;
  private readonly durations = new Map<number, number>();
  private readonly knownCount: Sums;
  private readonly representative: Uint8Array;
  private readonly samples: { base: number; seconds: number }[] = [];
  private sampleCount = 0;
  private sampleSeconds = 0;
  private factor: number | null = null;

  get calibration() {
    return { samples: this.sampleCount, audioSeconds: this.sampleSeconds, factor: this.factor,
      ready: this.sampleCount >= 3 && this.sampleSeconds >= 8 };
  }

  constructor(segments: ArrayLike<EngineSegment>) {
    this.base = new Float64Array(segments.length + 1);
    this.paragraphs = new Uint32Array(segments.length + 1);
    this.knownBase = new Sums(segments.length);
    this.knownSeconds = new Sums(segments.length);
    this.knownCount = new Sums(segments.length);
    this.representative = new Uint8Array(segments.length);
    for (let i = 0; i < segments.length; i++) {
      const text = segments[i].text;
      const weight = textSeconds(text);
      this.base[i + 1] = this.base[i] + weight;
      // Eight word equivalents, including CJK, with real letters rather than only numbers.
      this.representative[i] = weight >= 8 / 3 && /\p{L}/u.test(text) ? 1 : 0;
      this.paragraphs[i + 1] = this.paragraphs[i] + (segments[i].anchor === 'paragraphStart' ? 1 : 0);
    }
  }

  record(index: number, seconds: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.base.length - 1 || !Number.isFinite(seconds) || seconds < 0) return;
    const prior = this.durations.get(index);
    if (prior !== undefined) return;
    const base = this.base[index + 1] - this.base[index];
    this.durations.set(index, seconds);
    this.knownBase.add(index, base);
    this.knownSeconds.add(index, seconds);
    this.knownCount.add(index, 1);
    // Silent skips are known durations, but must not teach a voice to speak infinitely fast.
    if (!this.representative[index] || seconds <= 0.05) return;
    this.sampleCount++;
    this.sampleSeconds += seconds;
    this.samples.push({ base, seconds });
    if (this.samples.length > 16) this.samples.shift();
    const ratios = this.samples.map(s => s.seconds / s.base).sort((a, b) => a - b);
    const percentile = (p: number) => {
      const at = (ratios.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
      return ratios[lo] + (ratios[hi] - ratios[lo]) * (at - lo);
    };
    const low = percentile(0.1), high = percentile(0.9);
    let weighted = 0, weight = 0;
    for (const sample of this.samples) {
      weighted += sample.base * Math.max(low, Math.min(high, sample.seconds / sample.base));
      weight += sample.base;
    }
    const measured = weighted / weight;
    this.factor = this.factor === null ? measured : this.factor + 0.2 * (measured - this.factor);
  }

  /** [from, to), with the current clip offset in original audio seconds. No leading/trailing gap. */
  seconds(from: number, to: number, speed: number, pauses: PauseSettings, offset = 0): number | null {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to >= this.base.length || !Number.isFinite(speed) || speed <= 0) return null;
    const fullyMeasured = this.knownCount.range(from, to) === to - from;
    if (!fullyMeasured && !this.calibration.ready) return null;
    const factor = this.factor ?? 0;
    const base = this.base[to] - this.base[from] - this.knownBase.range(from, to);
    const speech = Math.max(0, base * factor + this.knownSeconds.range(from, to) - offset) / speed;
    const paragraphs = this.paragraphs[to] - this.paragraphs[from + 1];
    const sentence = computeGap({ paragraph: false, speed, settings: pauses });
    const paragraph = computeGap({ paragraph: true, speed, settings: pauses });
    return speech + ((to - from - 1 - paragraphs) * sentence + paragraphs * paragraph) / 1000;
  }
}

/** A display envelope bounded by cumulative listening rather than elapsed wall time. */
export class RemainingTimeDisplay {
  private value: number | null = null;
  private at = 0;

  reset(): void { this.value = null; }

  update(raw: number, listening: number): number {
    if (this.value === null) this.value = raw;
    else this.value = Math.max(this.value - 1.5 * Math.max(0, listening - this.at), Math.min(this.value, raw));
    this.at = listening;
    return this.value;
  }
}

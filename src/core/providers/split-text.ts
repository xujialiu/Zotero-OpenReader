/**
 * A Segment over a provider's input cap, asked for in pieces and played as
 * one clip: Speechify's 2,000 characters (issue #79) and the 4,096 of
 * OpenAI's speech route (issue #201). Zotero's segmentation keeps a
 * sentence of up to 5,000 UTF-8 bytes whole, so a run its sentence splitter
 * finds no end in can reach a provider as one Segment over either cap.
 */

/**
 * The text in pieces of at most `max` characters: each cut at the last
 * sentence end before the cap, else the last whitespace, else the cap
 * itself. The pieces concatenate back to the text, so `offset` is where
 * each begins in it.
 */
export function splitText(text: string, max: number): { text: string; offset: number }[] {
  const pieces: { text: string; offset: number }[] = [];
  let offset = 0;
  while (text.length - offset > max) {
    const window = text.slice(offset, offset + max);
    let cut = 0;
    for (const match of window.matchAll(/[。！？]|[.!?]\s/g)) cut = match.index + match[0].length;
    if (cut < 1) {
      for (let i = window.length - 1; i >= 0; i--) {
        if (/\s/.test(window[i])) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut < 1) cut = max;
    pieces.push({ text: window.slice(0, cut), offset });
    offset += cut;
  }
  pieces.push({ text: text.slice(offset), offset });
  return pieces;
}

// MPEG audio Layer III, in kbit/s and Hz, by the header's index fields
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** The length of an ID3v2 tag at the start of `bytes`, footer included; 0 when there is none. */
function id3Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  return Math.min(bytes.length, 10 + size + (bytes[5] & 0x10 ? 10 : 0));
}

/**
 * The length of the Layer III frame at `at` when it is a VBR header frame
 * (`Xing`, or `Info` from LAME), which carries no audio and states the
 * frame count of its own file; null for anything else.
 */
function vbrFrameLength(bytes: Uint8Array, at: number): number | null {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[at + 1] >> 3) & 3;
  const layer = (bytes[at + 1] >> 1) & 3;
  if (version === 1 || layer !== 1) return null;
  const crc = (bytes[at + 1] & 1) === 0 ? 2 : 0;
  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[(bytes[at + 2] >> 4) & 0xf];
  const rate = SAMPLE_RATES[version][(bytes[at + 2] >> 2) & 3];
  if (!bitrate || !rate) return null;
  const padding = (bytes[at + 2] >> 1) & 1;
  const length = Math.floor(((version === 3 ? 144000 : 72000) * bitrate) / rate) + padding;
  const mono = ((bytes[at + 3] >> 6) & 3) === 3;
  const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const tag = at + 4 + crc + sideInfo;
  const name = String.fromCharCode(...bytes.subarray(tag, tag + 4));
  return name === 'Xing' || name === 'Info' ? length : null;
}

/**
 * MP3 replies joined into one stream: each piece without its ID3 tag and
 * its VBR header frame, whose frame count would end the decoding at the
 * first piece. One piece is returned as it came.
 */
export function joinMp3(pieces: readonly Uint8Array[]): Uint8Array {
  if (pieces.length === 1) return pieces[0];
  const audio = pieces.map((bytes) => {
    let at = id3Length(bytes);
    at += vbrFrameLength(bytes, at) ?? 0;
    return bytes.subarray(at);
  });
  const out = new Uint8Array(audio.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of audio) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

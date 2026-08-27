/**
 * The measurable half of a voiceover.
 *
 * Audio is the one deliverable this harness cannot look at the way it looks at
 * an image, so the rule from checks.ts applies harder here: measure what can be
 * measured, and be explicit about the rest rather than letting an unanswered
 * question read as a pass.
 *
 * What is measured below: the bytes are a decodable MPEG audio stream, how long
 * it plays, and whether it is DIGITAL silence. What is NOT measured, and is
 * stated in the report rather than implied: whether the narrator speaks Arabic,
 * whether the dialect is the one that was paid for, whether the words are the
 * customer's script or an LLM rewrite of it, and whether it sounds like a human.
 * Those need ears, exactly as an invented object in an image needs eyes.
 *
 * No decoder and no ffmpeg: the frame headers alone give the duration exactly,
 * and depending on a binary that may not be installed would turn "unmeasured"
 * into "errored" on a developer's machine, which is the failure mode this file
 * exists to avoid.
 */

/** Layer III bitrates in kbps, indexed by the header's 4-bit field. */
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES_MPEG1 = [44100, 48000, 32000, 0];
const RATES_MPEG2 = [22050, 24000, 16000, 0];
const RATES_MPEG25 = [11025, 12000, 8000, 0];

export interface AudioMeasurement {
  /** Seconds, summed from the frame headers. null when nothing decodable was found. */
  seconds: number | null;
  frames: number;
  /** Hz of the first valid frame — OpenAI TTS serves 24 kHz, ElevenLabs 44.1 kHz. */
  sampleRate: number | null;
  bytes: number;
  /**
   * Share of the stream's bytes sitting inside a run of >= 16 identical bytes.
   *
   * A constant-bitrate MP3 of true silence is mostly long repeats; speech is
   * essentially never. This detects DIGITAL silence — an empty buffer that was
   * still encoded, uploaded and charged for — and deliberately not "quiet" or
   * "wrong voice", which it cannot see.
   */
  longRunShare: number;
}

/** ID3v2 prefix length, so the scan starts on audio rather than on tag bytes
 *  that contain 0xFF often enough to produce a plausible-looking false frame. */
function id3Length(buf: Buffer): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // 'ID3'
  // Synchsafe: seven bits per byte.
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return Math.min(buf.length, 10 + size);
}

interface Frame { length: number; seconds: number; sampleRate: number }

function parseFrame(buf: Buffer, i: number): Frame | null {
  if (i + 4 > buf.length) return null;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[i + 1] >> 3) & 0x03;   // 00 = 2.5, 01 = reserved, 10 = 2, 11 = 1
  const layerBits = (buf[i + 1] >> 1) & 0x03;     // 01 = Layer III
  if (versionBits === 0x01 || layerBits !== 0x01) return null;

  const bitrateIdx = (buf[i + 2] >> 4) & 0x0f;
  const rateIdx = (buf[i + 2] >> 2) & 0x03;
  const padding = (buf[i + 2] >> 1) & 0x01;

  const isMpeg1 = versionBits === 0x03;
  const bitrate = (isMpeg1 ? BITRATES_MPEG1 : BITRATES_MPEG2)[bitrateIdx];
  const sampleRate = (isMpeg1 ? RATES_MPEG1 : versionBits === 0x02 ? RATES_MPEG2 : RATES_MPEG25)[rateIdx];
  if (!bitrate || !sampleRate) return null;

  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const length = Math.floor(((isMpeg1 ? 144000 : 72000) * bitrate) / sampleRate) + padding;
  if (length < 4) return null;

  return { length, seconds: samplesPerFrame / sampleRate, sampleRate };
}

function longRunShare(buf: Buffer, minRun = 16): number {
  if (buf.length === 0) return 0;
  let inRuns = 0;
  let run = 1;
  for (let i = 1; i <= buf.length; i++) {
    if (i < buf.length && buf[i] === buf[i - 1]) { run++; continue; }
    if (run >= minRun) inRuns += run;
    run = 1;
  }
  return inRuns / buf.length;
}

/**
 * Walk the frame headers. A stream that yields no frames returns
 * `seconds: null` — "could not measure", which the runner reports as unmeasured
 * rather than as a failure. Confusing the two is how a harness starts inventing
 * defects, and an invented defect costs more to disprove than a real one costs
 * to fix.
 */
export function measureAudio(buf: Buffer): AudioMeasurement {
  const start = id3Length(buf);
  let i = start;
  let seconds = 0;
  let frames = 0;
  let sampleRate: number | null = null;

  while (i < buf.length - 4) {
    const frame = parseFrame(buf, i);
    if (!frame) { i++; continue; }
    if (sampleRate === null) sampleRate = frame.sampleRate;
    seconds += frame.seconds;
    frames++;
    i += frame.length;
  }

  return {
    seconds: frames > 0 ? seconds : null,
    frames,
    sampleRate,
    bytes: buf.length,
    longRunShare: longRunShare(buf.subarray(start)),
  };
}

/**
 * The share above which a stream is treated as digital silence.
 *
 * Deliberately generous. Real speech measures near zero here, so 0.5 leaves an
 * enormous margin and the check only ever fires on a stream that is genuinely
 * mostly repeated bytes. A tight threshold on a proxy metric is how a check
 * starts flagging correct output, which this repo has already paid for once.
 */
export const SILENCE_RUN_SHARE = 0.5;

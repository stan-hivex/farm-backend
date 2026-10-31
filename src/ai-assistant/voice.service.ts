import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const VOICE_MAX_BYTES = 2 * 1024 * 1024; // ~60 s of compressed speech
export const VOICE_MAX_SECONDS = 60;
export const STT_MODEL = 'grok-voice-transcribe-2.0';
const ALLOWED =
  /^audio\/(webm|ogg|opus|mpeg|mp3|mp4|m4a|x-m4a|aac|wav|x-wav|wave|flac)$|^video\/(webm|mp4)$/;

/**
 * Voice input for Mkulima: xAI speech-to-text only (POST {AI_BASE_URL}/stt),
 * using the same AI_API_KEY. Audio is kept in memory only and never stored.
 * The transcript is returned to the app, which shows it for the user to edit/confirm
 * before anything is sent to the assistant. Voice never carries a PIN.
 */
@Injectable()
export class VoiceService {
  private readonly log = new Logger(VoiceService.name);
  constructor(private readonly config: ConfigService) {}

  enabled() {
    return (
      this.config.get<string>('AI_ASSISTANT_ENABLED') === 'true' &&
      this.config.get<string>('AI_VOICE_ENABLED') !== 'false' &&
      !!this.config.get<string>('AI_API_KEY')
    );
  }

  async transcribe(
    file?: {
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    },
    hint?: string,
  ) {
    if (!this.enabled())
      throw new ServiceUnavailableException('Voice input is not enabled');
    if (!file?.buffer?.length) throw new BadRequestException('No audio');
    if (file.size > VOICE_MAX_BYTES)
      throw new HttpException(
        'Recording too long',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED.test(mime))
      throw new BadRequestException('Unsupported audio format');
    const base = (
      this.config.get<string>('AI_BASE_URL') || 'https://api.x.ai/v1'
    ).replace(/\/+$/, '');
    const form = new FormData();
    form.append('model', STT_MODEL);
    if (hint && /^[a-z]{2,3}(-[a-z]{2})?$/i.test(hint))
      form.append('language', hint);
    for (const k of ['FARM', 'Mkulima', 'M-Pesa', 'KSh', 'Nairobi'])
      form.append('keyterm', k);
    const ext = mime.split('/')[1].replace('x-', '').replace('mpeg', 'mp3');
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: mime }),
      `voice.${ext}`,
    );
    const ctrl = new AbortController();
    const t = setTimeout(
      () => ctrl.abort(),
      Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 30000),
    );
    try {
      const res = await fetch(`${base}/stt`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${this.config.get<string>('AI_API_KEY')}`,
        },
        body: form,
      });
      if (!res.ok) {
        this.log.warn(`STT failed: HTTP ${res.status}`);
        throw new HttpException(
          'Could not transcribe audio, please try again or type',
          res.status === 429
            ? HttpStatus.TOO_MANY_REQUESTS
            : HttpStatus.BAD_GATEWAY,
        );
      }
      const j: any = await res.json();
      const duration = Number(j?.duration ?? 0);
      if (duration > VOICE_MAX_SECONDS + 1)
        throw new HttpException(
          'Recording too long',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      const text = String(j?.text ?? '')
        .trim()
        .slice(0, 2000);
      const detected = String(j?.language ?? '').toLowerCase() || null;
      // xAI STT has no Swahili code yet and labels Swahili/Sheng speech as "en";
      // a small word check keeps Mkulima replying in the user's language.
      const sw = looksSwahili(text);
      return {
        transcript: text,
        language: sw ? 'sw' : detected,
        language_source: sw && detected !== 'sw' ? 'heuristic' : 'stt',
        duration,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.warn(`STT error: ${(e as Error)?.name}`);
      throw new HttpException(
        'Could not transcribe audio, please try again or type',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(t);
      file.buffer.fill(0); // drop audio from memory; never persisted
    }
  }
}

const SW_WORDS = new Set(
  'na ya wa kwa ni la za yangu wangu langu mimi nini gani kiasi tafadhali nataka naomba nitafutie hoteli bei nafuu zaidi tarehe kuingia kutoka mtu mmoja wawili salio pesa tuma nitumie unitumie miamala mwisho habari sasa niaje mambo poa msee doh doo cheki nicheki alafu halafu leo kesho jana shilingi elfu mia'.split(
    ' ',
  ),
);
export function looksSwahili(text: string) {
  const w = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (w.length < 3) return false;
  const hits = w.filter((x) => SW_WORDS.has(x)).length;
  return hits / w.length >= 0.25 && hits >= 2;
}

/** Instruction appended to the system prompt so Mkulima replies in the user's language. */
export function languageInstruction(lang?: string | null) {
  const l = (lang ?? '').toLowerCase().trim();
  if (!l || !/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(l)) return '';
  if (l.startsWith('sw'))
    return 'The user is speaking Swahili (possibly Sheng / Kenyan slang). Reply in the same Swahili/Sheng register they used, keep amounts in FARM/KSh.';
  if (l.startsWith('en')) return '';
  return `The user's language code is "${l}". Reply in that language.`;
}

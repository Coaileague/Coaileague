/**
 * Voice Message Transcription Service
 *
 * When a user sends a voice note in ChatDock, this service:
 * 1. Fetches the audio file from object storage
 * 2. Transcribes via OpenAI Whisper API
 * 3. Returns the transcript text
 *
 * Called from ChatServerHub when a message contains [Shared audio]
 */

import OpenAI from 'openai';
import { createLogger } from '../../lib/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const log = createLogger('VoiceTranscription');
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function transcribeVoiceMessage(audioUrl: string): Promise<string | null> {
  if (!openai) {
    log.warn('[Transcription] OpenAI not configured — skipping transcription');
    return null;
  }

  if (!audioUrl || typeof audioUrl !== 'string') {
    return null;
  }

  let tmpPath: string | null = null;
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      log.warn('[Transcription] Failed to fetch audio:', audioUrl, response.status);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
      log.warn('[Transcription] Audio too large or empty:', buffer.length);
      return null;
    }

    const extMatch = audioUrl.match(/\.(webm|mp3|wav|m4a|ogg|mp4)(?:\?|$)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'webm';
    tmpPath = path.join(os.tmpdir(), `voice-${randomUUID()}.${ext}`);

    fs.writeFileSync(tmpPath, buffer);
    const fileStream = fs.createReadStream(tmpPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    });

    const text = typeof transcription === 'string'
      ? transcription
      : ((transcription as any)?.text || null);

    return text && text.trim().length > 0 ? text.trim() : null;
  } catch (err: unknown) {
    log.warn('[Transcription] Error:', err?.message);
    return null;
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch { /* non-fatal */ }
    }
  }
}

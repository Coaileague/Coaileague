/**
 * VOICE INTENT DETECTOR — Phase 21
 * ================================
 * Fast regex-based intent classification for spoken input on the IVR.
 * Used before the AI resolver to route calls without a network round-trip
 * when the caller's intent is unambiguous.
 *
 * Returns 'unknown' when the speech does not match any of the well-known
 * caller categories — the calling route should then fall through to the
 * general menu or to the full Trinity AI resolver.
 */

export type VoiceIntent =
  | 'employee'      // "I'm an employee", "officer", "I work for..."
  | 'client'        // "I'm a client", "I need security", "my guards"
  | 'sales'         // "I want to join", "sign up", "learn about"
  | 'emergency'     // "help", "emergency", "panic"
  | 'careers'       // "job", "apply", "employment"
  | 'verify'        // "verify employment", "background check"
  | 'support'       // "I need help", "problem", "issue"
  | 'unknown';

export function detectVoiceIntent(
  speech: string,
  _lang: 'en' | 'es' = 'en',
): VoiceIntent {
  const s = (speech || '').toLowerCase().trim();
  if (!s) return 'unknown';

  if (/\b(emergency|emergencia|panic|duress|danger|peligro|nine one one|9 1 1|911|sos)\b/.test(s)) {
    return 'emergency';
  }

  if (
    /\b(employee|officer|guard|staff|i work|my shift|clock|schedule|pay|calloff|call off)\b/.test(s) ||
    /\b(empleado|guardia|oficial|turno|horario|pago|trabajo|reloj)\b/.test(s)
  ) {
    return 'employee';
  }

  if (
    /\b(client|customer|we need|we hired|our guard|my provider|my security|security company)\b/.test(s) ||
    /\b(cliente|proveedor|nuestra empresa|guardias|empresa de seguridad)\b/.test(s)
  ) {
    return 'client';
  }

  if (
    /\b(join|sign up|register|interested in|learn about|partnership|new company|coaileague|co-?league|demo|pricing|quote|buy|purchase|cost|price|plans?|subscription)\b/.test(s) ||
    /\b(unirse|registrar|interesado|nueva empresa|asociarme|precio|precios|comprar|costo|cotizaci[oó]n|suscripci[oó]n)\b/.test(s)
  ) {
    return 'sales';
  }

  if (
    /\b(job|career|apply|hiring|position|work for you)\b/.test(s) ||
    /\b(trabajo|empleo|aplicar|contratar|oportunidad)\b/.test(s)
  ) {
    return 'careers';
  }

  if (
    /\b(verify|verification|background|employment check)\b/.test(s) ||
    /\b(verificar|verificación|antecedentes)\b/.test(s)
  ) {
    return 'verify';
  }

  if (
    /\b(help|problem|issue|question|support|call about)\b/.test(s) ||
    /\b(ayuda|problema|pregunta|soporte)\b/.test(s)
  ) {
    return 'support';
  }

  return 'unknown';
}

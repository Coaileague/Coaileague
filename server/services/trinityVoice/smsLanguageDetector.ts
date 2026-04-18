/**
 * SMS Language Detector
 * Detects whether an inbound SMS is in Spanish or English.
 * Used when employee preferred_language is not set or unknown.
 * Fast regex-based detection — no AI call needed.
 */

// Common Spanish words/patterns that reliably indicate Spanish
const SPANISH_INDICATORS = [
  /\b(hola|gracias|ayuda|turno|horario|trabajo|necesito|quiero|puedo|puede)\b/i,
  /\b(mi|tu|el|ella|nosotros|ellos|por favor|de nada|buenos|buenas)\b/i,
  /\b(semana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i,
  /\b(pago|sueldo|nómina|nomina|vacaciones|permiso|enfermo|ausente)\b/i,
  /\b(sí|si|no|por qué|porque|cuándo|cuando|dónde|donde|cómo|como)\b/i,
  /[áéíóúñü¿¡]/,
];

export function detectLanguage(text: string): 'en' | 'es' {
  if (!text || text.trim().length === 0) return 'en';
  const spanishMatches = SPANISH_INDICATORS.filter((pattern) => pattern.test(text)).length;
  return spanishMatches >= 1 ? 'es' : 'en';
}

/**
 * Detect language from an email subject + body combined.
 * Slightly stronger heuristics than SMS detector — emails are longer
 * and tend to include staffing vocabulary.
 */
export function detectEmailLanguage(subject: string, body: string): 'en' | 'es' {
  const text = `${subject || ''} ${body || ''}`;
  const spanishSignals = [
    /\b(hola|gracias|necesito|turno|trabajo|guardia|seguridad|solicito|requiero)\b/i,
    /\b(buenos días|buenas tardes|buenas noches|cordial saludo|estimado|estimada)\b/i,
    /\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i,
    /\b(contrato|factura|oficial|armado|desarmado|patrulla|vigilante)\b/i,
    /[áéíóúñü¿¡]/,
  ];
  return spanishSignals.some((p) => p.test(text)) ? 'es' : 'en';
}

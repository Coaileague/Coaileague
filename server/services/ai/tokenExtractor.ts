export function extractGeminiTokens(response: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const r = response as any;
  return {
    inputTokens:
      r?.usageMetadata?.promptTokenCount ??
      r?.response?.usageMetadata?.promptTokenCount ??
      r?.candidates?.[0]?.tokenCount ??
      0,
    outputTokens:
      r?.usageMetadata?.candidatesTokenCount ??
      r?.response?.usageMetadata?.candidatesTokenCount ??
      0,
  };
}

export function extractClaudeTokens(response: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const r = response as any;
  return {
    inputTokens:
      r?.usage?.input_tokens ??
      r?.usage?.inputTokens ??
      0,
    outputTokens:
      r?.usage?.output_tokens ??
      r?.usage?.outputTokens ??
      0,
  };
}

export function extractGptTokens(response: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const r = response as any;
  return {
    inputTokens:
      r?.usage?.prompt_tokens ??
      r?.usage?.promptTokens ??
      0,
    outputTokens:
      r?.usage?.completion_tokens ??
      r?.usage?.completionTokens ??
      0,
  };
}

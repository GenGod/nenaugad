export class FeatureUnavailableError extends Error {
  readonly code = "AI_NOT_IMPLEMENTED";
  constructor() { super("AI_NOT_IMPLEMENTED"); }
}

// Deliberately no SDK, key, arbitrary prompt, transport, or paid implementation.
// This fails closed even if a caller accidentally reaches it.
export async function generateCoverLetter(): Promise<never> {
  throw new FeatureUnavailableError();
}

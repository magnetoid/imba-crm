// Anthropic model pricing as of April 2026
// Source: https://docs.anthropic.com/en/docs/about-claude/models
// Prices in USD per million tokens

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  // Current models
  'claude-opus-4-7': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },

  // Legacy models still available
  'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-4-5-20250929': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-5-20251101': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-1-20250805': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-opus-4-1': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-sonnet-4-20250514': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4-0': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-20250514': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-opus-4-0': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-3-haiku-20240307': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
};

/**
 * Calculate the cost of an API call in cents.
 * Returns cost as a decimal number of cents (USD).
 */
export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) {
    return 0;
  }

  const inputCostDollars = (tokensIn / 1_000_000) * pricing.inputPerMTok;
  const outputCostDollars = (tokensOut / 1_000_000) * pricing.outputPerMTok;
  const totalCents = (inputCostDollars + outputCostDollars) * 100;

  return totalCents;
}

export { ANTHROPIC_PRICING };

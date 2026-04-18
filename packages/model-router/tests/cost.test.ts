import { describe, expect, it } from 'vitest';
import { calculateCost } from '../src/cost.js';

describe('calculateCost', () => {
  it('calculates cost for claude-opus-4-7', () => {
    // $5/MTok in, $25/MTok out
    // 1000 tokens in = 1000/1M * $5 = $0.005 = 0.5 cents
    // 500 tokens out = 500/1M * $25 = $0.0125 = 1.25 cents
    // Total = 1.75 cents
    const cost = calculateCost('claude-opus-4-7', 1000, 500);
    expect(cost).toBeCloseTo(1.75, 10);
  });

  it('calculates cost for claude-sonnet-4-6', () => {
    // $3/MTok in, $15/MTok out
    // 10000 tokens in = 10000/1M * $3 = $0.03 = 3 cents
    // 2000 tokens out = 2000/1M * $15 = $0.03 = 3 cents
    // Total = 6 cents
    const cost = calculateCost('claude-sonnet-4-6', 10000, 2000);
    expect(cost).toBeCloseTo(6, 10);
  });

  it('calculates cost for claude-haiku-4-5', () => {
    // $1/MTok in, $5/MTok out
    // 100000 tokens in = 100000/1M * $1 = $0.1 = 10 cents
    // 50000 tokens out = 50000/1M * $5 = $0.25 = 25 cents
    // Total = 35 cents
    const cost = calculateCost('claude-haiku-4-5', 100000, 50000);
    expect(cost).toBeCloseTo(35, 10);
  });

  it('calculates cost for claude-opus-4-6', () => {
    // $5/MTok in, $25/MTok out (same as opus 4.7)
    const cost = calculateCost('claude-opus-4-6', 1000, 500);
    expect(cost).toBeCloseTo(1.75, 10);
  });

  it('calculates cost for claude-opus-4-1', () => {
    // $15/MTok in, $75/MTok out
    // 1000 in = 1000/1M * $15 = $0.015 = 1.5 cents
    // 500 out = 500/1M * $75 = $0.0375 = 3.75 cents
    // Total = 5.25 cents
    const cost = calculateCost('claude-opus-4-1', 1000, 500);
    expect(cost).toBeCloseTo(5.25, 10);
  });

  it('calculates cost for claude-3-haiku-20240307', () => {
    // $0.25/MTok in, $1.25/MTok out
    // 1000000 in = $0.25 = 25 cents
    // 1000000 out = $1.25 = 125 cents
    // Total = 150 cents
    const cost = calculateCost('claude-3-haiku-20240307', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(150, 10);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCost('unknown-model', 1000, 500);
    expect(cost).toBe(0);
  });

  it('handles zero tokens', () => {
    const cost = calculateCost('claude-sonnet-4-6', 0, 0);
    expect(cost).toBe(0);
  });
});

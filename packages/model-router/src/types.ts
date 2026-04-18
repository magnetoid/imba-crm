import { z } from 'zod';

// ── Task Types ──────────────────────────────────────────────────────────────

export const TaskTypes = [
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'embedding',
  'voice',
  'vision',
  'research',
] as const;

export type TaskType = (typeof TaskTypes)[number];

// ── Message shape (subset of Anthropic messages) ────────────────────────────

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: ImageSource;
}

export interface ImageSource {
  type: 'base64' | 'url';
  media_type?: string;
  data?: string;
  url?: string;
}

// ── Task Inputs (discriminated union) ───────────────────────────────────────

export interface ReasoningInput {
  type: 'reasoning';
  messages: Message[];
  systemPrompt?: string;
}

export interface DraftingInput {
  type: 'drafting';
  messages: Message[];
  systemPrompt?: string;
}

export interface ClassificationInput {
  type: 'classification';
  messages: Message[];
  labels?: string[];
  systemPrompt?: string;
}

export interface ExtractionInput {
  type: 'extraction';
  messages: Message[];
  systemPrompt?: string;
}

export interface EmbeddingInput {
  type: 'embedding';
  input: string | string[];
}

export interface VoiceInput {
  type: 'voice';
  audio: ArrayBuffer | string;
  format?: 'wav' | 'mp3' | 'ogg' | 'webm';
}

export interface VisionInput {
  type: 'vision';
  messages: Message[];
  systemPrompt?: string;
}

export interface ResearchInput {
  type: 'research';
  query: string;
  systemPrompt?: string;
}

export type TaskInput =
  | ReasoningInput
  | DraftingInput
  | ClassificationInput
  | ExtractionInput
  | EmbeddingInput
  | VoiceInput
  | VisionInput
  | ResearchInput;

// ── Task Outputs (discriminated union) ──────────────────────────────────────

export interface ReasoningOutput {
  type: 'reasoning';
  content: string;
}

export interface DraftingOutput {
  type: 'drafting';
  content: string;
}

export interface ClassificationOutput {
  type: 'classification';
  content: string;
}

export interface ExtractionOutput {
  type: 'extraction';
  content: string;
}

export interface EmbeddingOutput {
  type: 'embedding';
  embeddings: number[][];
}

export interface VoiceOutput {
  type: 'voice';
  content: string;
}

export interface VisionOutput {
  type: 'vision';
  content: string;
}

export interface ResearchOutput {
  type: 'research';
  content: string;
}

export type TaskOutput =
  | ReasoningOutput
  | DraftingOutput
  | ClassificationOutput
  | ExtractionOutput
  | EmbeddingOutput
  | VoiceOutput
  | VisionOutput
  | ResearchOutput;

// ── Provider types ──────────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  modelId?: string;
}

export interface ProviderResponse {
  content: string;
  embeddings?: number[][];
  tokensIn: number;
  tokensOut: number;
  model: string;
  raw: unknown;
}

export interface ModelProvider {
  name: string;
  execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse>;
  stream?(task: TaskInput, config: ProviderConfig): AsyncGenerator<string, void, unknown>;
}

// ── Policy types ────────────────────────────────────────────────────────────

export interface ProviderChainEntry {
  provider: string;
  modelId: string;
}

export type ProviderChain = ProviderChainEntry[];

export type Policy = Record<TaskType, ProviderChain>;

// ── Router types ────────────────────────────────────────────────────────────

export interface AICallEvent {
  taskType: TaskType;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export type RouteSuccess<T> = {
  ok: true;
  data: T;
  event: AICallEvent;
};

export type RouteFailure = {
  ok: false;
  error: { code: string; message: string; attempts: AICallEvent[] };
  event: AICallEvent;
};

export type RouteResult<T> = RouteSuccess<T> | RouteFailure;

export interface RouteOptions {
  policyOverride?: Partial<Policy>;
  providerConfigs?: Record<string, ProviderConfig>;
  timeout?: number;
}

// ── Zod schemas for runtime validation ──────────────────────────────────────

export const TaskTypeSchema = z.enum(TaskTypes);

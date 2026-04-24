import type {
  EmbeddingProvider,
  EmbeddingProviderConfig
} from "./types.js";

function hashTextToVector(text: string, length: number): number[] {
  const vector = new Array<number>(length).fill(0);

  for (let index = 0; index < text.length; index += 1) {
    vector[index % length] += text.charCodeAt(index) / 255;
  }

  return vector.map((value) => Number((value / Math.max(1, text.length)).toFixed(6)));
}

export class ScaffoldOpenAiEmbeddingProvider implements EmbeddingProvider {
  name = "openai";

  constructor(private readonly config: EmbeddingProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(process.env[this.config.apiKeyEnvVar]);
  }

  async embedText(text: string): Promise<number[]> {
    return hashTextToVector(text, 16);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedText(text)));
  }
}

export class NoopEmbeddingProvider implements EmbeddingProvider {
  name = "none";

  isConfigured(): boolean {
    return false;
  }

  async embedText(text: string): Promise<number[]> {
    return hashTextToVector(text, 16);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedText(text)));
  }
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig
): EmbeddingProvider {
  if (config.provider === "openai") {
    return new ScaffoldOpenAiEmbeddingProvider(config);
  }

  return new NoopEmbeddingProvider();
}

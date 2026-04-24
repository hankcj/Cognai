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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export class ScaffoldOpenAiEmbeddingProvider implements EmbeddingProvider {
  name = "openai";
  private readonly cache = new Map<string, number[]>();

  constructor(private readonly config: EmbeddingProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(process.env[this.config.apiKeyEnvVar]);
  }

  async embedText(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    let vector = hashTextToVector(text, 16);
    const apiKey = process.env[this.config.apiKeyEnvVar];

    if (this.isConfigured() && apiKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const response = await fetch(
          `${trimTrailingSlash(this.config.baseUrl)}/embeddings`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: this.config.model,
              input: text
            }),
            signal: controller.signal
          }
        );
        clearTimeout(timeout);

        if (response.ok) {
          const payload = (await response.json()) as {
            data?: Array<{ embedding?: number[] }>;
          };
          const remote = payload.data?.[0]?.embedding;
          if (Array.isArray(remote) && remote.length > 0) {
            vector = remote;
          }
        }
      } catch {
        vector = hashTextToVector(text, 16);
      }
    }

    this.cache.set(text, vector);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedText(text)));
  }
}

export class NoopEmbeddingProvider implements EmbeddingProvider {
  name = "none";
  private readonly cache = new Map<string, number[]>();

  isConfigured(): boolean {
    return false;
  }

  async embedText(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    const vector = hashTextToVector(text, 16);
    this.cache.set(text, vector);
    return vector;
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

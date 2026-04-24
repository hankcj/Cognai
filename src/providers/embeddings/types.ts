export interface EmbeddingProvider {
  name: string;
  isConfigured(): boolean;
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderConfig {
  provider: "none" | "openai";
  model: string;
  apiKeyEnvVar: string;
}

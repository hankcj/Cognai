import test from "node:test";
import assert from "node:assert/strict";

import { createEmbeddingProvider } from "../src/providers/embeddings/openai.js";
import { createEnrichmentProvider } from "../src/providers/enrichment/openai.js";

test(
  "openai embeddings provider smoke test",
  { skip: !process.env.OPENAI_API_KEY },
  async () => {
    const provider = createEmbeddingProvider({
      provider: "openai",
      model: "text-embedding-3-small",
      apiKeyEnvVar: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      timeoutMs: 15000
    });

    const vector = await provider.embedText("independence and sustainable work");
    assert.ok(vector.length > 0);
  }
);

test(
  "openai-compatible auxiliary reasoning smoke test",
  { skip: !process.env.AI_GATEWAY_API_KEY },
  async () => {
    const provider = createEnrichmentProvider({
      enabled: true,
      provider: "openai-compatible",
      model: process.env.AI_GATEWAY_MODEL ?? "google/gemini-2.5-flash-lite",
      apiKeyEnvVar: "AI_GATEWAY_API_KEY",
      baseUrl: "https://ai-gateway.vercel.sh/v1",
      timeoutMs: 20000
    });

    const text = await provider.completeText?.([
      {
        role: "system",
        content: "Answer in exactly one short sentence."
      },
      {
        role: "user",
        content: "Say hello."
      }
    ]);

    assert.ok(text);
  }
);

test(
  "anthropic auxiliary reasoning smoke test",
  { skip: !process.env.ANTHROPIC_API_KEY },
  async () => {
    const provider = createEnrichmentProvider({
      enabled: true,
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL ?? "claude-3.5-haiku",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      baseUrl: "https://api.anthropic.com",
      timeoutMs: 20000
    });

    const text = await provider.completeText?.([
      {
        role: "system",
        content: "Answer in exactly one short sentence."
      },
      {
        role: "user",
        content: "Say hello."
      }
    ]);

    assert.ok(text);
  }
);

test(
  "google auxiliary reasoning smoke test",
  { skip: !process.env.GOOGLE_API_KEY },
  async () => {
    const provider = createEnrichmentProvider({
      enabled: true,
      provider: "google",
      model: process.env.GOOGLE_MODEL ?? "gemini-2.5-flash",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      timeoutMs: 20000
    });

    const text = await provider.completeText?.([
      {
        role: "system",
        content: "Answer in exactly one short sentence."
      },
      {
        role: "user",
        content: "Say hello."
      }
    ]);

    assert.ok(text);
  }
);

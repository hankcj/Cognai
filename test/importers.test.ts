import test from "node:test";
import assert from "node:assert/strict";

import { Mem0ImportAdapter } from "../src/importers/adapters/mem0.js";
import { MemPalaceImportAdapter } from "../src/importers/adapters/mempalace.js";
import { ObsidianImportAdapter } from "../src/importers/adapters/obsidian.js";

test("mem0 adapter normalizes messages and memories", () => {
  const adapter = new Mem0ImportAdapter();
  const envelope = adapter.normalize({
    conversation_id: "mem0-conv",
    messages: [{ role: "user", content: "hello" }],
    memories: [{ memory: "user values independence" }]
  });

  assert.equal(envelope.conversation.id, "mem0-conv");
  assert.equal(envelope.messages.length, 1);
  assert.equal(envelope.memory_entries.length, 1);
});

test("mempalace adapter normalizes conversation payloads", () => {
  const adapter = new MemPalaceImportAdapter();
  const envelope = adapter.normalize({
    conversation: {
      id: "palace-conv",
      messages: [{ speaker: "assistant", text: "hi there" }]
    }
  });

  assert.equal(envelope.conversation.id, "palace-conv");
  assert.equal(envelope.messages[0]?.role, "ai");
});

test("obsidian adapter normalizes markdown notes as memory entries", () => {
  const adapter = new ObsidianImportAdapter();
  const envelope = adapter.normalize({
    vault: { path: "/vault" },
    notes: [
      {
        id: "Founder.md:hash",
        path: "Founder.md",
        title: "Founder",
        content: "I care about craft and calm growth.",
        metadata: {
          content_hash: "hash"
        }
      }
    ]
  });

  assert.equal(envelope.source, "obsidian");
  assert.equal(envelope.memory_entries.length, 1);
  assert.equal(envelope.memory_entries[0]?.metadata.external_system, "obsidian");
  assert.equal(envelope.memory_entries[0]?.metadata.note_path, "Founder.md");
});

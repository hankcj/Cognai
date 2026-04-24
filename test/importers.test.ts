import test from "node:test";
import assert from "node:assert/strict";

import { Mem0ImportAdapter } from "../src/importers/adapters/mem0.js";
import { MemPalaceImportAdapter } from "../src/importers/adapters/mempalace.js";

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

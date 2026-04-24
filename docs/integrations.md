# Integrations

Cognai is designed to sit on top of memory systems, not replace them.

Current scaffold integration strategy:

- import transcripts or memory exports from external systems
- normalize them into one Cognai envelope
- infer semantic graph updates and provenance episodes
- expose the resulting context through MCP tools

This preserves the product boundary:

- external memory systems remain responsible for rich episodic recall
- Cognai remains responsible for values, goals, beliefs, tensions, and provenance-backed cognitive retrieval

The current adapters for Mem0 and MemPalace are intentionally lightweight normalization layers so the internal interfaces stabilize before live connector work begins.

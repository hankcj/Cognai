# Cognai — Product Requirements Document
**Version:** 0.2 (Cognitive Science Revision)  
**Status:** Pre-development  
**Author:** Hank / KILN

---

## 1. Overview

### 1.1 What Cognai Is

Cognai is an open source MCP server, installable via npm, that builds and maintains a structured model of a user's cognitive architecture — their values, goals, beliefs, reasoning tendencies, preferences, and contradictions — so that AI models can orient every response in service of what that person is actually trying to accomplish and why.

Most memory systems give AI models a bag of facts about a user. Cognai gives AI models a compass.

### 1.2 The Core Problem

Existing AI memory solutions (mem0, MemGPT, MemPalace, custom goals.md documents) share a common limitation: they store *what* a user is thinking about, but not *how* or *why* they think. A memory object like "user is building a SaaS" is useful. But without knowing that the SaaS exists in service of a deeper value like "creative autonomy," or that it sits in tension with a competing belief like "I don't want to manage a team," the AI is operating with surface-level context — answering the query without understanding the person.

Cognai solves this by modeling not just the nodes of a user's thinking, but the *weighted, directional relationships between them* — making it possible for an AI to understand not just what the user cares about, but what those things are *in service of*, what they *conflict with*, and what they *reveal* about the user's underlying cognitive architecture.

### 1.3 Core Design Principle

**Representation, not simulation.**

Cognai does not attempt to make the AI reason *like* the user. That would cause the AI to inherit the user's blind spots and bad reasoning patterns. Instead, Cognai gives the AI a deep, structured representation of the user's cognitive architecture so it can remain a distinct reasoning agent — one that can push back, surface tensions, and challenge assumptions — while always orienting its responses in service of what actually matters to that person.

### 1.4 Target Users

- Individual developers and power users who want AI assistants that genuinely understand them over time
- Organizations that want AI interactions across their team to be oriented toward shared company values, goals, and decision-making patterns
- Developers building AI-powered tools who want to offer deep personalization as a feature

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Ship a working MCP server installable with a single `npm install` command
- Provide a default cognitive node taxonomy that works out of the box for most users
- Model a user's cognitive architecture as a weighted directed graph with semantically typed edges
- Retrieve the right subgraph at query time without injecting unnecessary tokens into context
- Surface retrieval reasoning transparently so users can audit and correct the model
- Support both individual users and organization-level cognitive models
- Plug and play on top of existing memory systems as a complementary layer

### 2.2 Non-Goals (v1)

- A visual graph UI (may come in a later version)
- Real-time collaborative editing of the cognitive model
- Support for multimodal input (images, audio) as inference sources
- A hosted cloud version (v1 is local-first only)
- Fine-tuning or model training on cognitive data
- **Plan nodes** — BDI-style plan library representing step-by-step execution paths attached to Commitments. Deferred to v2; Commitment nodes can carry a `trigger` field as a lightweight substitute.
- **Narrative nodes** — McAdams-style life-chapter structures linking sequences of Episodes and Identity Claims into a coherent self-story. Requires a large episodic corpus before meaningful narratives can be detected. Deferred to v2.
- **Schema detection** — mining recurring subgraph patterns to identify the user's cognitive schemas (Bartlett/Rumelhart). Emergent, not primitive; should be detected over an established graph rather than hand-authored. Deferred to v2.
- **Analogical retrieval** — Gentner-style structure-mapping across contexts ("you're approaching this conflict the same way you approached the one last year"). Requires graph-matching infrastructure beyond v1 scope. Deferred to v2/v3.
- **Feedback loop detection** — Senge-style identification of reinforcing and balancing cycles in the graph (e.g. "Belief(I'm not enough) → Goal(prove myself) → burnout → evidence for Belief(I'm not enough)"). Requires cycle detection and narrative coherence. Deferred to v2.

---

## 3. Architecture Overview

Cognai is organized into five layers. Each layer has a distinct responsibility and communicates with adjacent layers through defined interfaces.

```
┌─────────────────────────────────────────┐
│         Layer 5: CLI / Init             │
│   cognai init · cognai sync · inspect   │
├─────────────────────────────────────────┤
│         Layer 4: MCP Interface          │
│  cognai_query · update · explain · flag │
├─────────────────────────────────────────┤
│       Layer 3: Retrieval Engine         │
│    5-pass retrieval · subgraph output   │
│         · transparency block           │
├─────────────────────────────────────────┤
│       Layer 2: Inference Engine         │
│  conversation watching · graph updates  │
│    · confidence decay · contradiction   │
├─────────────────────────────────────────┤
│          Layer 1: Storage               │
│    KuzuDB · nodes · typed edges ·       │
│   confidence scores · stated/inferred   │
└─────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 The Graph

The core data structure is a **weighted directed graph** where:

- **Nodes** represent cognitive objects — discrete units of a user's thinking
- **Edges** carry semantic type, direction, confidence score, and provenance
- **The graph as a whole** represents the user's cognitive architecture at a point in time

The graph is stored in KuzuDB, an embedded graph database that handles both graph traversal and vector embeddings in a single dependency, requiring no external services.

### 4.2 Node Schema

Every node, regardless of type, carries the following minimum schema:

```typescript
interface CognaiNode {
  id: string                    // UUID
  type: NodeType                // see taxonomy below
  label: string                 // short human-readable name
  description: string           // full description, used for embedding
  source: "stated" | "inferred" // how this node was created
  confidence: number            // 0.0 - 1.0, Bayesian-ish weight updated by evidence
  activation: number            // recency × frequency score — drives retrieval speed
                                // high activation = fast/automatic retrieval (System 1-like)
                                // low activation = only retrieved via deliberate traversal
  centrality: number            // 0.0 - 1.0, how foundational this node is to the overall
                                // belief web — high centrality nodes resist revision
  construal_level: "high" | "mid" | "low"
                                // Maps to Construal Level Theory:
                                // high = Values, Identity Claims (abstract, stable, why-focused)
                                // mid = Goals, Commitments (instrumental, time-bounded)
                                // low = Preferences, Assumptions (concrete, behavioral, how-focused)
  created_at: timestamp
  updated_at: timestamp
  last_reinforced_at: timestamp // used by confidence decay
  embedding: vector             // generated at write time, stored in Kuzu
  metadata: Record<string, any> // user/org defined extensions
}
```

### 4.3 Edge Schema

```typescript
interface CognaiEdge {
  id: string
  from_node_id: string
  to_node_id: string
  type: EdgeType                // see semantic edge types below
  confidence: number            // 0.0 - 1.0
  source: "stated" | "inferred"
  created_at: timestamp
  metadata: Record<string, any>
}
```

### 4.4 Semantic Edge Types

Edges are not generic links. Every edge carries a semantic type that describes *how* two nodes are related:

| Edge Type | Meaning |
|---|---|
| `IN_SERVICE_OF` | This node exists to fulfill the target node |
| `CONTRADICTS` | These two nodes are in direct tension |
| `CONFLICTS_WITH_BUT_HELD_IN_TENSION` | User is aware of the conflict and wants it preserved |
| `REVEALED_BY` | This node was inferred from a specific behavior or decision |
| `DOWNSTREAM_OF` | This node is caused by or follows from the target node |
| `SUPPORTS` | This node provides evidence for or reinforces the target node |
| `ASSUMES` | This node takes the target node as a precondition |
| `REGULATES` | A Belief points to another Belief it governs — the metacognitive layer. Enables "I tend to believe X when I'm in state Y" and similar second-order reasoning |
| `INHIBITS` | A Fear blocks a Goal or Commitment from being pursued. Makes the behavioral consequence of fear structurally explicit rather than implicit |
| `PROTECTS` | A Fear defends a Value or Identity Claim. Every Fear node requires at least one PROTECTS edge — a fear without something it defends is structurally incomplete |
| `TRIGGERS` | A Situation or Episode activates a Reasoning Pattern. Captures the context-dependence of how someone reasons ("when under deadline, I make fast intuitive calls") |
| `DISCREPANT_WITH` | A current-self Identity Claim points to an aspirational or feared Identity Claim it diverges from. Richer than CONTRADICTS for identity specifically — signals motivational tension rather than logical conflict |

### 4.5 Node Taxonomy

The node type system is layered: core defaults ship with Cognai and are always available, suggested extensions are documented for common use cases, and user/org defined types can be created with a minimum schema.

#### Core Defaults (ships with Cognai)

| Type | Description |
|---|---|
| `Value` | Terminal — what the person is ultimately optimizing for. The highest-order nodes. Everything else points toward these. Construal level: high. Exempt from confidence decay by default. |
| `Goal` | Instrumental — exists in service of one or more Values. Time-bounded and achievable. Carries two required extended properties: `regulatory_style` (external / introjected / identified / intrinsic — from Self-Determination Theory) and `time_horizon`. A Goal flagged `introjected` is a candidate contradiction with Identity Claims and should be surfaced by the retrieval engine. Construal level: mid. |
| `Belief` | A held proposition about how the world works. Can be stated or inferred. Beliefs can point to other Beliefs via `REGULATES` edges to represent metacognitive structure ("I believe that I tend to believe X when stressed"). Construal level: varies. |
| `Contradiction` | Two nodes explicitly held in tension. Preserved rather than resolved. Created automatically by the belief revision engine when conflicting nodes are detected. Carries a `dissonance_magnitude` weight representing how much importance-weighted conflict exists — high-magnitude contradictions surface in retrieval; low-magnitude ones are background noise. |
| `Preference` | Lighter weight than a Belief, more behavioral. How the user tends to choose between options. Construal level: low. |
| `Reasoning Pattern` | How the user tends to approach a class of problems. Carries a `mode` property: `habitual` (automatic, fast — surfaced by default in retrieval) or `deliberate` (reflective, slow — surfaced only when the user is explicitly working through a hard problem). Connected to triggering contexts via `TRIGGERS` edges. |
| `Commitment` | A Goal the user has explicitly committed to pursuing — carries social, contractual, or psychological weight beyond a mere intention. Derived from BDI Intention + Gollwitzer's implementation intentions. Optionally carries a `trigger` field ("if situation Y, then action Z") that makes the commitment executable rather than abstract. Construal level: mid. |
| `Identity Claim` | "I am the kind of person who..." — shapes decisions without being a stated goal. Carries a required `valence` property: `current` (how the user sees themselves now), `aspirational` (hoped-for self), or `feared` (self the user is trying not to become). `DISCREPANT_WITH` edges between current and aspirational Identity Claims are the primary signal for self-discrepancy — one of the most diagnostically useful structures in the graph. Construal level: high. |

#### Suggested Extensions (documented, opt-in)

| Type | Description |
|---|---|
| `Fear` | What the person is avoiding, not just pursuing. Grounded in appraisal theory: a Fear node's content is a perceived threat (severity + susceptibility). Requires at minimum one `INHIBITS` edge (pointing to the Goal or Commitment it blocks) and one `PROTECTS` edge (pointing to the Value or Identity Claim it defends). A Fear without these edges is structurally incomplete and will be flagged by the inference engine. |
| `Assumption` | A Belief that is held but unexamined — believed without explicit justification. Flagged for lower default confidence (0.3). The primary target for Socratic surfacing: when the inference engine detects reasoning that depends heavily on an unexamined Assumption, it should flag this for the AI. |

#### User/Org Defined Types

Any node type can be defined by the user or organization. Custom types must provide at minimum:

```typescript
interface CustomNodeType {
  name: string
  description: string
  inherits_from?: CoreNodeType  // optional, for inference engine hints
}
```

### 4.6 The Episodic Store

Cognai maintains two parallel memory stores rather than a single graph, mirroring the semantic/episodic distinction that is foundational in both cognitive science (Tulving) and mature cognitive architectures (ACT-R, Soar).

**The semantic graph** (described in sections 4.1–4.5) holds timeless cognitive objects — beliefs, values, goals, identity claims. These are what the user *generally* thinks, not what they said on a specific Tuesday.

**The episodic store** holds time-stamped source events — specific conversational moments that gave rise to inferences in the semantic graph. Episodes are lightweight and live in a parallel store, not inside the main graph.

```typescript
interface EpisodeNode {
  id: string
  conversation_id: string       // which conversation this came from
  timestamp: timestamp          // when it occurred
  utterance: string             // the raw text that triggered the inference
  speaker: "user" | "ai"
  inferred_node_ids: string[]   // IDs of semantic nodes written as a result
}
```

Episodes connect into the semantic graph exclusively via `REVEALED_BY` edges on semantic nodes pointing back to Episode IDs. This means:

- `cognai_explain` can cite a specific conversation as the origin of any inferred node — not just a timestamp but the actual utterance
- The inference engine has a clear audit trail for every graph write
- Episodic data can be pruned for privacy without corrupting the semantic graph — only the `REVEALED_BY` edge is orphaned, not the node itself

This is the architectural foundation that makes the transparency block meaningful. Without episodic provenance, "why do you think that about me?" can only return a timestamp. With it, it can return the exact moment.

### 4.7 Belief Revision Policy

The PRD specifies that the inference engine watches conversations and updates the graph. What happens structurally when new evidence contradicts an existing node must be defined explicitly — different policies produce fundamentally different graph behavior over time.

Cognai adopts an **AGM-inspired conservative revision policy**. The core principle: the graph preserves cognitive history. Nodes are weakened and flagged before they are ever deleted. Deletion is always explicit and user-initiated.

**Three-case policy for conflicting writes:**

**Case 1 — New evidence significantly outweighs existing node confidence:**
Weaken the existing node's confidence (multiply by 0.6), create a `Contradiction` node linking both, and write the new node at its inferred confidence. Both nodes remain queryable. The Contradiction node carries a `dissonance_magnitude` weight proportional to the confidence gap and the centrality of the nodes involved.

**Case 2 — Confidence is roughly equal (within 0.2):**
Create the `Contradiction` node linking both, flag both nodes with `needs_review`, and write the new node. Do not modify existing confidence. Surface the contradiction in the next retrieval where either node is relevant.

**Case 3 — New evidence is weaker than existing node:**
Write the new node at low confidence, create a weak `CONTRADICTS` edge, and do not modify the existing node. Low-weight contradictions are background noise that accumulates until it clears a surfacing threshold.

**Deletion is never automatic.** Only the user, via `cognai_flag` followed by explicit CLI confirmation, can permanently remove a node. This is the difference between a system that models a mind and a system that just stores the current version of a mind.

### 4.8 Schwartz Value Conflict Priors

Cognai ships with a pre-seeded conflict topology derived from Schwartz's Theory of Basic Values — one of the most empirically robust frameworks in value psychology, validated across 82+ countries. Schwartz demonstrated that values are arranged in a circular motivational continuum along two orthogonal axes, and that values on opposite sides of the circle are structurally in tension.

When the inference engine writes two Value nodes that correspond to opposing regions of the Schwartz circumplex, it automatically creates a low-weight `CONFLICTS_WITH_BUT_HELD_IN_TENSION` edge between them — even before the user articulates the conflict.

**The six primary prior conflict pairs:**

| Value cluster A | Value cluster B | Axis |
|---|---|---|
| Achievement / Power | Benevolence / Universalism | Self-enhancement vs. Self-transcendence |
| Stimulation / Self-direction | Security / Conformity | Openness-to-change vs. Conservation |
| Hedonism | Tradition / Conformity | Personal focus vs. Collective obligation |

Prior edges start at weight 0.2 — low enough not to dominate retrieval, high enough to be traversed when either node is retrieved. If the conflict surfaces in conversation, the weight increases. If the user explicitly resolves or dismisses it, the weight decreases or the edge is removed.

This makes Cognai feel structurally intelligent from day one — before it knows anything specific about the user, it already knows something about human motivational structure.

**Important caveat:** The Schwartz circumplex is a prior, not a truth. Cognai treats it as a weak signal that yields to stated user context. A user who genuinely holds both achievement and benevolence as non-conflicting core values can explicitly mark that edge as resolved.

---

## 5. Layer 1: Storage

### 5.1 Database: KuzuDB

Cognai ships with **KuzuDB** as the default embedded graph database.

**Why KuzuDB:**
- Purpose-built for graph data — nodes and typed edges are first-class citizens, not a relational workaround
- Handles both graph traversal queries and vector embeddings in a single dependency
- Fully embedded — runs inside the npm package, no external service required
- Node.js bindings available

**What this means for the install story:**
`npm install cognai` pulls in KuzuDB as a dependency. No Docker, no running a separate database process, no configuration before first use. The database initializes automatically on `cognai init`.

### 5.2 Storage Interface Abstraction

While KuzuDB is the default, the storage layer is accessed through an abstract interface so advanced users can swap it out. Any storage adapter must implement:

```typescript
interface CognaiStorage {
  writeNode(node: CognaiNode): Promise<void>
  updateNode(id: string, updates: Partial<CognaiNode>): Promise<void>
  writeEdge(edge: CognaiEdge): Promise<void>
  getNode(id: string): Promise<CognaiNode>
  queryByEmbedding(vector: number[], topK: number): Promise<CognaiNode[]>
  traverseEdges(nodeId: string, edgeTypes: EdgeType[], hops: number): Promise<CognaiSubgraph>
  getTopValueNodes(limit: number): Promise<CognaiNode[]>
  flagNode(id: string, flag: FlagType): Promise<void>
  decayConfidence(olderThan: Date, decayRate: number): Promise<void>
}
```

---

## 6. Layer 2: Inference Engine

The inference engine is responsible for watching conversations and keeping the graph current. It operates on a dual-trigger model.

### 6.1 Passive Trigger: End-of-Conversation Batch Processing

After a conversation closes, the inference engine does a single pass over the full transcript. This is the primary update path. Operating on the full conversation rather than message-by-message gives the engine richer context for inference — it can see patterns across a whole exchange rather than reacting to individual messages.

The engine looks for:
- Explicitly stated values, goals, or beliefs
- Behavioral reveals — decisions, preferences expressed through choices
- Contradictions with existing nodes
- Reinforcement of existing nodes (increases confidence)
- Staleness signals — something the user used to believe but seems to be moving away from

### 6.2 Active Trigger: Real-Time High-Signal Writes

During a live conversation, the AI model can call `cognai_update` or `cognai_flag` immediately when something highly significant is observed — for example, a user explicitly stating a core value, or directly contradicting a high-confidence node in the graph. This is not automatic; it requires the AI to exercise judgment about what clears the bar for a real-time write.

### 6.3 Confidence Decay

A scheduled process (default: weekly) slightly decreases confidence scores on nodes that have not been reinforced recently. This prevents the graph from treating six-month-old beliefs as current with the same confidence as recently expressed ones.

Decay is configurable:
```typescript
interface DecayConfig {
  schedule: CronExpression     // default: "0 0 * * 0" (weekly)
  decay_rate: number           // default: 0.05 per cycle
  floor: number                // default: 0.2 — nodes never go below this
  exempt_types: NodeType[]     // e.g. exempt Values from decay
}
```

### 6.4 Contradiction Detection

When the inference engine writes a new node or updates an existing one, it runs a contradiction check against semantically similar nodes. If a potential conflict is detected, it either:
- Creates a `Contradiction` node and links both conflicting nodes to it with `CONTRADICTS` edges
- Flags the conflict for user review if confidence is below a threshold
- Honors an existing `CONFLICTS_WITH_BUT_HELD_IN_TENSION` edge and preserves both nodes

---

## 7. Layer 3: Retrieval Engine

The retrieval engine receives an incoming query and returns a lean, purposeful subgraph — not the whole cognitive model, just the nodes and edges that are relevant to orienting the AI's response to this specific query. It also generates a transparency block explaining the retrieval.

### 7.1 The 5-Pass Retrieval System

**Pass 1 — Intent Classification**

The incoming query is classified by type before any graph access occurs. Classification determines which node types are even candidates for retrieval in this context.

Classification categories include: decision-making, creative problem, strategic question, interpersonal situation, factual lookup, task execution, values/identity question, organizational question.

**Pass 2 — Telos Anchoring**

Always pull the top-level `Value` nodes first. These are the compass — small, high-signal, cheap in tokens, and they should be present in almost every response. This baseline context costs approximately 150-250 tokens and orients all subsequent passes.

**Pass 3 — Semantic Similarity**

Run the query text against node description embeddings to find which specific nodes are semantically close to what's being asked. Returns the top-K nodes above a similarity threshold, where K is configurable (default: 8).

**Pass 4 — Edge Traversal**

For each node retrieved in Pass 3, traverse outward 1-2 hops along typed edges. The traversal asks: "does this connected node materially change the answer?" Traversal prioritizes:
- `IN_SERVICE_OF` edges back toward Values (always follow)
- `CONTRADICTS` and `CONFLICTS_WITH_BUT_HELD_IN_TENSION` edges (always follow)
- `REVEALED_BY` edges when source provenance is relevant
- `DOWNSTREAM_OF` and `SUPPORTS` edges when causal context matters

**Pass 5 — Contradiction Check**

Before returning the subgraph, check whether any retrieved nodes have `CONTRADICTS` or `CONFLICTS_WITH_BUT_HELD_IN_TENSION` edges between them. If yes, these are explicitly flagged in the output so the AI knows to hold them in tension rather than silently resolving to one side.

### 7.2 Retrieval Output

The retrieval engine returns two things:

**The subgraph** — a structured set of nodes and edges relevant to the query:
```typescript
interface CognaiSubgraph {
  telos_anchors: CognaiNode[]        // top Value nodes
  relevant_nodes: CognaiNode[]       // Pass 3 + 4 results
  active_tensions: CognaiEdge[]      // Pass 5 contradiction flags
  confidence_floor_met: boolean      // false triggers wider pull or warning
}
```

**The transparency block** — a human-readable explanation of why this subgraph was returned:
```
[Cognai Context]
Telos anchors: Creative autonomy, Long-term independence
Retrieved nodes: Goal: Build KILN as a recognized brand,
                 Belief: Authenticity compounds over time
Edge traversal: Goal → IN_SERVICE_OF → Value: Creative autonomy
Tension flagged: Growth velocity CONTRADICTS Sustainability preference
Retrieval confidence: 0.87
Why this subgraph: Query classified as brand/positioning decision.
Pulled goal and belief nodes with high semantic similarity.
Surfaced known tension between growth and sustainability as directly relevant.
```

The transparency block is collapsible in UI contexts, optional in raw API mode, but always generated and always available.

### 7.3 Confidence Floor

If the retrieval engine's confidence that it assembled the right subgraph falls below a configurable threshold (default: 0.6), it either widens the pull to include more candidate nodes, or flags the response with an incomplete-context warning so the AI knows to be more careful about assuming it fully understands the user's orientation on this topic.

---

## 8. Layer 4: MCP Interface

Cognai exposes four tools to the AI model via the MCP protocol. The tool surface is intentionally minimal — four tools with clean separation of concerns and no overlap.

### 8.1 `cognai_query`

The primary tool. Called at the start of most interactions where user context is relevant.

```typescript
cognai_query(intent: string): CognaiQueryResult
```

Takes the incoming user message or a summary of it, runs the full 5-pass retrieval, and returns the relevant subgraph plus the transparency block. This is what gets injected into the AI's context before formulating a response.

**When to call:** Any query where understanding the user's values, goals, or reasoning orientation would improve the response.

### 8.2 `cognai_update`

The write tool. Called when the AI observes something worth writing to the graph.

```typescript
cognai_update(
  node_type: NodeType,
  label: string,
  description: string,
  source: "stated" | "inferred",
  confidence: number,
  edges?: EdgeSpec[]
): CognaiNode
```

**When to call:** User explicitly states a value or goal, AI infers a strong preference from behavior, a new belief is articulated, a contradiction with an existing node is observed.

### 8.3 `cognai_explain`

Called when the user asks why the AI thinks something about them, or when the AI wants to surface its reasoning about a specific node.

```typescript
cognai_explain(node_id: string): CognaiNodeProvenance
```

Returns the full provenance of a node: when it was created, what conversation or behavior it was inferred from, its full edge relationships, confidence score history, and decay status.

**When to call:** "Why do you think that about me?", "Where did you get the idea that I value X?", any time transparency about a specific belief in the model is warranted.

### 8.4 `cognai_flag`

Lets the AI mark a node as potentially stale, contradicted by recent behavior, or uncertain — without immediately deleting or overwriting it. Preserves graph integrity while keeping it honest.

```typescript
cognai_flag(
  node_id: string,
  flag_type: "stale" | "contradicted" | "uncertain" | "needs_review"
): void
```

**When to call:** User's recent behavior seems inconsistent with a high-confidence node, a belief hasn't been reinforced in a long time, the AI is uncertain whether a node still reflects the user's current thinking.

---

## 9. Layer 5: CLI and Init

The CLI provides the developer-facing surface for setup, maintenance, and inspection.

### 9.1 `cognai init`

Initializes a new Cognai instance. Creates the KuzuDB database, sets up the default node taxonomy, and generates a config file.

```bash
cognai init
# Options:
#   --user      Initialize for a single user (default)
#   --org       Initialize in organization mode
#   --config    Path to config file
```

On init, the user is prompted to optionally provide a brief self-description to seed the graph with initial stated nodes. This is optional but improves early retrieval quality.

### 9.2 `cognai sync`

Runs the inference engine manually over a provided conversation transcript or conversation history.

```bash
cognai sync --transcript ./conversation.json
cognai sync --since "7 days ago"
```

### 9.3 `cognai inspect`

Human-readable inspection of the current graph state.

```bash
cognai inspect
# Shows: node count by type, high-confidence nodes, active tensions,
#        recently updated nodes, confidence distribution, decay status

cognai inspect --node <node_id>
# Shows: full provenance of a specific node

cognai inspect --tensions
# Shows: all active contradiction pairs
```

---

## 10. Organization Mode

When initialized with `--org`, Cognai models the cognitive architecture of an organization rather than an individual user.

In org mode:
- The telos layer (top-level `Value` nodes) represents the organization's mission and core values
- `Goal` nodes represent organizational objectives, not personal ones
- Individual user queries are answered in service of organizational goals unless a personal context is explicitly scoped
- The inference engine watches organizational communications (meeting transcripts, decision logs, strategy documents) in addition to AI conversations
- Multiple users can contribute stated nodes, with source tracking per contributor

This enables AI assistants deployed inside organizations to consistently orient their responses toward what the company is actually trying to accomplish — not just toward the surface request of whoever is typing.

---

## 11. Integration with Existing Memory Systems

Cognai is designed to layer on top of existing memory systems, not replace them. However, the relationship is more specific than it first appears.

Cognai now maintains its own lightweight episodic store (section 4.6) — time-stamped conversational source events that feed the semantic graph. This means Cognai handles its own provenance tracking internally and does not depend on an external memory system for "what happened."

What external memory systems (mem0, MemGPT, MemPalace) provide that Cognai does not is **richly indexed episodic retrieval** — the ability to answer "what did we discuss last Tuesday?" or "what was the decision we made about X?" in full fidelity. Cognai's episodic store is minimal by design: it stores only the utterances that triggered graph writes, not the full conversational record.

The recommended integration pattern is:
1. External memory system handles full episodic recall — complete conversation history, decisions made, topics discussed
2. Cognai handles cognitive architecture — values, goals, beliefs, reasoning patterns, identity, and the typed relationships between them
3. Cognai's own episodic store provides provenance for graph nodes — the "where did this come from" layer
4. At query time, all three contribute to context — external memory provides the *what happened*, Cognai's semantic graph provides the *why and in service of*, Cognai's episodic store provides the *this was inferred from*

Cognai exposes a `CognaiStorage` interface that can ingest structured data from other memory systems to bootstrap the semantic graph.

---

## 12. Token Efficiency

Cognai is designed with token efficiency as a first-class constraint. The retrieval system is built specifically to avoid the failure mode of injecting an entire user profile into every context window.

Key efficiency mechanisms:
- **5-pass retrieval** returns only the relevant subgraph, not the full graph
- **Telos anchoring** provides a cheap 150-250 token baseline that covers the most important context
- **Intent classification** gates which node types are even considered for a given query
- **Confidence floor** prevents low-value nodes from polluting retrieved context
- **Transparency block** is separate from the subgraph and can be suppressed in token-sensitive deployments

Typical retrieval output is targeted at 300-600 tokens for most queries, with complex multi-tension queries going up to approximately 1000 tokens.

---

## 13. Dependency Summary

| Dependency | Role | Rationale |
|---|---|---|
| KuzuDB | Graph storage + vector embeddings | Embedded, graph-native, zero external services |
| Node.js MCP SDK | MCP server implementation | Standard MCP tooling |
| OpenAI / Anthropic embedding API (configurable) | Generating node embeddings | Pluggable — user provides API key and preferred provider |

The embedding provider is pluggable from day one. Users configure which embedding API they want to use. Cognai does not ship with a bundled embedding model in v1 to keep the package size manageable, but a local embedding option (e.g. via ollama) is on the roadmap.

---

## 14. Open Questions for v1 Scoping

The following decisions are deferred and should be resolved before implementation begins:

1. **Embedding provider default** — which API should we recommend out of the box? OpenAI text-embedding-3-small is the obvious choice for familiarity, but it requires an OpenAI API key. An alternative is to ship with a small local model for users who want zero external dependencies.

2. **Conversation transcript format** — what format should `cognai sync` accept? JSON is the obvious choice but we should define a schema that can ingest from multiple sources (Claude, ChatGPT, custom apps).

3. **Config file format** — YAML or JSON? Where does it live by default?

4. **Org mode access control** — in v1, who can write nodes in org mode? Any user, or only designated admins?

5. **MCP server hosting** — does Cognai run as a persistent background process or does it spin up per-request? Persistent is better for performance, per-request is simpler to install.

6. **Belief revision policy configurability** — the AGM-inspired conservative revision policy (section 4.7) is proposed as the default. Should this be configurable per deployment? Some power users may want stricter revision (hard delete stale nodes after a confidence floor is reached); others may want even more conservative behavior (never weaken without explicit user confirmation). This is an architectural constraint with significant downstream effects and should be decided before implementation.

---

## 15. Success Criteria for v1

- `npm install cognai && cognai init` works on macOS, Linux, and Windows in under two minutes with no external services required
- `cognai_query` returns a relevant subgraph with transparency block in under 500ms for graphs up to 500 nodes
- The default node taxonomy covers 80% of use cases without requiring custom types
- The inference engine correctly identifies and writes at least one meaningful node from a typical 10-message conversation transcript
- A developer familiar with MCP can integrate Cognai into an existing AI application in under an hour
- The inference engine correctly preserves the distinction between episodic source events and inferred semantic nodes, such that `cognai_explain` can cite a specific conversation utterance as the origin of any inferred Belief, Value, or Goal node — not just a timestamp

---

*End of PRD v0.2 — updated with cognitive science research findings*

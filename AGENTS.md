# AGENTS.md — Instructions for Autonomous Coding Agents

## Context & Mission

This repository contains **Dissent**, an AI Trading Desk decision-support platform built for the **Bitget AI x Crypto Hackathon** (AI Trading Desk track).

Dissent stress-tests a trader's thesis through structured hypothesis extraction, verifiable market evidence, adversarial argument construction (Advocate vs. Dissenter), assumption stress-testing, and synthesis of a **Dissent Brief**.

**The AI researches and challenges. The HUMAN makes the trading decision.**

---

## Architectural Constraints & Non-Negotiables

Any agent modifying this codebase **MUST NOT** violate the following rules:

### 1. Inward Dependency Rule
- `src/core/` is the pure domain model.
- Core domain/contracts have no dependency on Next.js, Bitget, AI providers, databases, browser APIs, or infrastructure adapters. Zod is permitted for runtime contract validation.
- `src/core/` **MUST NEVER** import from `src/app/`, `src/server/`, Next.js, React, Bitget SDKs, AI client libraries, or databases.
- External adapters and services live in `src/server/` or `src/lib/` and implement ports defined in `src/server/`.

### 2. The Human Decision Invariant (Strict)
- **AI NEVER decides `PROCEED`, `WATCH`, or `PASS`.**
- `HumanDecisionV1` can **only** be authored by a verified human operator action (`actorType: 'HUMAN_OPERATOR'`).
- The synthesis stage of the AI pipeline produces a `DissentBriefV1` where `humanDecision` is initialized to `null`. It is strictly forbidden for an LLM prompt to populate or select a trading decision.

### 3. Evidence Before Narrative
- Live market facts **MUST NOT** be hallucinated or stated in isolation by an LLM.
- All material facts in arguments and briefs **MUST** link to an `id` present in `EvidenceLedgerV1`.
- Raw observation values and model interpretations must remain distinct.
- `EvidenceV1.provenance` is immutable once ingested.
- Freshness is deterministically derived from provenance timestamps and bounded windows, not stored as a static property that rots over time.

### 4. Verbatim Thesis Preservation
- The trader's original input string (`ThesisInputV1.rawText`) must be preserved verbatim throughout the entire lifecycle.
- `StructuredThesisV1.originalThesis` must be identical to `ThesisInputV1.rawText`.
- Structured interpretations, asset splits, and direction classifications must be kept separate from the raw conviction text.

### 5. No Fake Precision
- **DO NOT** introduce arbitrary numerical confidence scores (e.g. "87% confidence", "0.92 score").
- Use categorical, discrete evaluations:
  - Assumption status: `UNTESTED` | `SUPPORTED` | `QUESTIONED` | `CONTRADICTED` | `INSUFFICIENT_EVIDENCE`
  - Scenario plausibility: `HIGH` | `MEDIUM` | `LOW` | `TAIL_RISK`
  - Argument weight: `PRIMARY` | `SECONDARY` | `CONTEXTUAL`
  - Freshness (derived): `REALTIME` | `RECENT` | `DELAYED` | `HISTORICAL` | `STALE`

### 6. Non-Goals
Dissent is strictly decision-support infrastructure. It is **NOT**:
- An automated trade execution engine or trading bot.
- A "BUY" / "SELL" signal caller.
- A generic crypto chatbot.
- A price prediction engine.

---

## Repository Boundaries & Locations

```
src/
├── app/                  # Next.js App Router (UI routes & API routes)
├── components/           # Reusable UI components
├── core/
│   ├── contracts/        # Zod schemas & derived TypeScript types (V1)
│   ├── domain/           # Domain invariant guards & validation
│   └── errors/           # Typed DissentError classes and error codes
├── server/
│   ├── ai/               # AI Analyst semantic ports & LLM adapters
│   ├── market/           # Market Desk port & Bitget exchange adapter
│   └── orchestration/    # Run lifecycle state machine & orchestrator
└── lib/                  # Shared utilities (crypto, hashing, time)
```

---

## Instructions for Codex / GPT-5.6 Sol High (Core Engineering Phase)

Tomorrow's focus is implementing the core engine without destabilizing the foundation:

1. **Bitget Adapter (`src/server/market/bitget.adapter.ts`)**:
   - Implement read-only market data retrieval using Bitget V2 endpoints.
   - Map tickers, funding rates, open interest, and orderbook depth into `EvidenceV1` items.
   - Maintain verifiable source metadata and timestamps.

2. **AI Semantic Desk (`src/server/ai/`)**:
   - Implement `ThesisStructuringPort`, `ArgumentationPort`, `StressTestingPort`, and `SynthesisPort`.
   - Use structured outputs / tool calling matching the schemas in `src/core/contracts/`.
   - Never write single unconstrained "do everything" prompts.

3. **Orchestrator (`src/server/orchestration/`)**:
   - Execute the multi-stage lifecycle (`DRAFT` -> `STRUCTURING` -> `RESEARCHING` -> `ARGUING` -> `STRESS_TESTING` -> `SYNTHESIZING` -> `COMPLETED`).
   - Transition between stages using `isValidStageTransition`.
   - Persist run state and intermediate artifacts.

4. **Testing**:
   - Run `npm test` after any structural change.
   - Keep contract tests green at all times.

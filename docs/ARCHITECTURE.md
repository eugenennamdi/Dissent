# Dissent Architecture & Technical Design

## 1. Architectural Philosophy: Onion / Hexagonal Architecture

Dissent enforces strict separation between domain logic and external infrastructure (adapters, APIs, frameworks):

```
       +--------------------------------------------------------+
       |                  External / Adapters                   |
       |  [Next.js App Router]  [Bitget REST API]  [AI Models]  |
       |                           |                            |
       |       +-------------------+--------------------+       |
       |       |       Server Boundaries & Ports        |       |
       |       |  MarketDeskPort    AiAnalystDeskPort   |       |
       |       |  OrchestratorPort                      |       |
       |       |                   |                    |       |
       |       |       +-----------+------------+       |       |
       |       |       |      Core Domain       |       |       |
       |       |       |  Contracts & Zod Types |       |       |
       |       |       |  Domain Invariants     |       |       |
       |       |       |  Typed Domain Errors   |       |       |
       |       |       +------------------------+       |       |
       |       +----------------------------------------+       |
       +--------------------------------------------------------+
```

### Dependency Rules:
- **Core Domain (`src/core/`)** has no dependency on Next.js, Bitget, AI providers, databases, browser APIs, or infrastructure adapters. Zod is permitted for runtime contract validation.
- **Server Ports (`src/server/`)** declare inbound/outbound contracts that external systems must satisfy.
- **Adapters (`src/server/market/`, `src/server/ai/`)** implement the ports and isolate API quirks, network retries, and format translations.

---

## 2. Component Boundaries

### Core Domain (`src/core/`)
- `contracts/`: Versioned Zod schemas and derived TypeScript types for all product entities (`ThesisInputV1`, `StructuredThesisV1`, `AssumptionV1`, `EvidenceV1`, `EvidenceLedgerV1`, `ArgumentV1`, `StressScenarioV1`, `InvalidationConditionV1`, `DissentBriefV1`, `HumanDecisionV1`, `AnalysisRunV1`).
- `domain/invariants.ts`: Invariant assertion logic (human decision checks, verbatim thesis preservation, evidence ledger referential integrity, state machine transitions).
- `errors/domain-errors.ts`: Typed domain error classes (`INVALID_INPUT`, `UNSUPPORTED_MARKET`, `EVIDENCE_UNAVAILABLE`, `EVIDENCE_STALE`, `EXTERNAL_PROVIDER_ERROR`, `MODEL_OUTPUT_INVALID`, `ANALYSIS_FAILED`, `TIMEOUT`).

### Market Desk Boundary (`src/server/market/`)
- `market-desk.port.ts`: The generic domain interface for market observation collection.
- `bitget.adapter.ts`: Read-only adapter for Bitget's public V3 REST market API. It validates instruments, spot/futures tickers, and spot candles before normalization and never accepts trading credentials.
- `bitget.schemas.ts`: Zod validation for untrusted V3 provider envelopes and payloads.
- `decimal.ts`: deterministic integer-backed decimal calculations; financial arithmetic never passes through binary floating point.
- `evidence.factory.ts`: canonical SHA-256 identity, content hashing, and ledger assembly.
- `MarketDeskPort` returns an `EvidenceLedgerV1` plus explicit research gaps so a partial provider failure cannot masquerade as complete research.

### AI Analyst Boundary (`src/server/ai/`)
- `ai-analyst.port.ts`: Strongly typed semantic operations:
  - `structureThesis(ThesisInputV1): Promise<{ structuredThesis, initialAssumptions }>`
  - `buildAdvocateCase(StructuredThesisV1, EvidenceLedgerV1, AssumptionV1[]): Promise<ArgumentV1>`
  - `buildDissentCase(StructuredThesisV1, EvidenceLedgerV1, AssumptionV1[]): Promise<ArgumentV1>`
  - `stressTest(StructuredThesisV1, AssumptionV1[], EvidenceLedgerV1): Promise<{ stressScenarios, invalidationConditions, testedAssumptions }>`
  - `synthesizeBrief(params): Promise<DissentBriefV1>`
- Strictly avoids generic `generate(prompt: string): Promise<string>` interfaces. Every operation takes domain contracts and returns domain contracts.

### Orchestration Boundary (`src/server/orchestration/`)
- `orchestrator.port.ts`: Controls the lifecycle and transitions between analysis stages.

---

## 3. Future Orchestration Flow

```
[Trader Raw Input]
       │
       ▼ (Stage: DRAFT)
[Orchestrator: startRun()]
       │
       ▼ (Stage: STRUCTURING)
[AI Analyst: structureThesis()]
       ├── Extracts: StructuredThesisV1
       └── Generates: Initial AssumptionV1[]
       │
       ▼ (Stage: RESEARCHING)
[Market Desk: gatherMarketObservations()] ──> (Bitget Adapter)
       ├── Queries: instruments, spot/futures tickers, spot candles
       ├── Calculates: interval returns, return spread, and relative return deterministically
       └── Returns: EvidenceLedgerV1 + explicit research gaps
       │
       ▼ (Stage: ARGUING)
[AI Analyst: Parallel Argumentation]
       ├── Advocate: buildAdvocateCase() (Grounded in ledger)
       └── Dissenter: buildDissentCase() (Attacking assumptions with evidence)
       │
       ▼ (Stage: STRESS_TESTING)
[AI Analyst: stressTest()]
       ├── Evaluates assumptions against stress regimes
       └── Formulates observable InvalidationConditionV1[]
       │
       ▼ (Stage: SYNTHESIZING)
[AI Analyst: synthesizeBrief()]
       └── Assembles 11-section DissentBriefV1 (humanDecision: null)
       │
       ▼ (Stage: COMPLETED)
[Human Trader Review]
       │
       ▼ [recordHumanDecision()]
[HumanDecisionV1: PROCEED | WATCH | PASS]
```

---

## 4. Grounding & Tamper-Resistant Provenance

1. **Deterministic Evidence Lineage**: Each `EvidenceV1` item carries an immutable `provenance` block recording the exact endpoint, source observation timestamp, local retrieval timestamp, content hash, and the selected upstream fields needed for audit.
2. **Referential Integrity**: An argument point cannot claim an external observation unless its `evidenceIds` point to an entry in the run's `EvidenceLedgerV1`.
3. **No LLM Fabrication**: Because the synthesis stage receives the completed `EvidenceLedgerV1`, any model hallucination that introduces unsourced market data violates the domain invariants and fails contract validation.

## 5. Phase 1 Bitget Integration

The adapter uses one current API generation consistently:

- `GET /api/v3/market/instruments` — confirms that `BTCUSDT` and `ETHUSDT` spot instruments are online.
- `GET /api/v3/market/tickers` — spot price/24h volume and USDT-perpetual funding/open-interest snapshots.
- `GET /api/v3/market/candles` — aligned, closed `1H` spot candles for up to the V1 48-hour lookback.

These endpoints are public, require no authentication, and are documented at 20 requests/second/IP. The adapter uses native `fetch`, an 8-second default timeout, and the fixed `https://api.bitget.com` origin. Agent Hub is intentionally not installed: its MCP/SDK and trading modules add no advantage to this small server-side, public-read workflow.

Direct observations use Bitget's `ts` or candle timestamp. Retrieval time is recorded separately. Ticker facts have a 60-second realtime window and become stale after the bounded freshness bands. Closed candles use `HISTORICAL_RECORD`: they remain historical facts rather than becoming false with age. Derived observations reference every input evidence ID.

Evidence IDs are `ev_` plus a SHA-256 hash of canonical identity data. Direct identity includes source, endpoint path, market/instrument/measurement semantics, source time or interval, canonical value, and unit; retrieval time and query-window parameters are deliberately excluded, so reprocessing the same observation is stable while a later snapshot with the same displayed price remains distinct by source timestamp. Derived identity additionally includes the ordered source evidence IDs. Ledger IDs hash the thesis ID and sorted item IDs.

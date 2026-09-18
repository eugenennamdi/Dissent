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
- `bitget.adapter.ts`: Concrete implementation that communicates with Bitget REST/WS APIs to pull market data (funding rates, orderbook depth, 24h ticker metrics, open interest) and map them into normalized `EvidenceV1` objects.

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
       ├── Queries: Ticker, Funding, Open Interest, Orderbook
       └── Normalizes to: EvidenceLedgerV1 (Immutable provenance)
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

1. **Deterministic Evidence Lineage**: Each `EvidenceV1` item carries an immutable `provenance` block recording the exact endpoint, observation timestamp, local retrieval timestamp, and raw JSON snapshot.
2. **Referential Integrity**: An argument point cannot claim an external observation unless its `evidenceIds` point to an entry in the run's `EvidenceLedgerV1`.
3. **No LLM Fabrication**: Because the synthesis stage receives the completed `EvidenceLedgerV1`, any model hallucination that introduces unsourced market data violates the domain invariants and fails contract validation.

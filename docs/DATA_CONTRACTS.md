# Dissent V1 Data Contracts & Invariants

> **Note**: The definitive source of truth for all schemas is the executable Zod definitions in `src/core/contracts/`. This document explains contract semantics, boundaries, and domain rules.

---

## 1. `ThesisInputV1` (`src/core/contracts/thesis.ts`)

Represents the raw, un-opinionated trader submission.

- **Fields**:
  - `id`: Unique identifier for the input.
  - `rawText`: Verbatim text submitted by the trader.
  - `traderId`: Optional identifier for the user session.
  - `submittedAt`: ISO 8601 timestamp.
  - `schemaVersion`: Fixed literal `1`.
- **Invariants**:
  - `rawText` must be preserved verbatim across all downstream transformations.

---

## 2. `StructuredThesisV1` (`src/core/contracts/thesis.ts`)

Normalized hypothesis extracted from the raw input.

- **Fields**:
  - `id`: Unique thesis ID.
  - `thesisInputId`: Reference to `ThesisInputV1.id`.
  - `originalThesis`: Exact copy of `ThesisInputV1.rawText`.
  - `market`: Normalized market symbol (e.g. `ETH/BTC`, `SOL/USDT`).
  - `baseAsset`: Base symbol (e.g. `ETH`).
  - `quoteAsset`: Quote symbol (e.g. `BTC`).
  - `claim`: Clear, falsifiable proposition statement.
  - `direction`: Enum (`LONG`, `SHORT`, `RELATIVE_LONG`, `RELATIVE_SHORT`, `NEUTRAL`, `VOLATILITY_EXPANSION`, `VOLATILITY_COMPRESSION`).
  - `timeHorizon`: Object with description and optional numeric `estimatedHours`.
  - `catalysts`: Non-empty array of stated or inferred market drivers.
  - `createdAt`: ISO 8601 timestamp.
  - `schemaVersion`: Fixed literal `1`.

---

## 3. `AssumptionV1` (`src/core/contracts/assumption.ts`)

First-class entity analyzing the trader's underlying reasoning.

- **Fields**:
  - `id`: Unique assumption ID.
  - `thesisId`: Reference to `StructuredThesisV1.id`.
  - `claim`: Core assumption claim.
  - `type`: `EXPLICIT` (directly stated by trader) | `INFERRED` (deduced prerequisite).
  - `category`: `MARKET_REGIME` | `CORRELATION` | `POSITIONING` | `MACRO` | `LIQUIDITY` | `CATALYST_TIMING` | `MICROSTRUCTURE` | `OTHER`.
  - `status`: Discrete categorical status:
    - `UNTESTED`: Not investigated yet.
    - `SUPPORTED`: Evidence currently supports the assumption.
    - `QUESTIONED`: Evidence raises material questions.
    - `CONTRADICTED`: Evidence contradicts the assumption.
    - `INSUFFICIENT_EVIDENCE`: Research performed, but available evidence is insufficient to assess.
  - `challenge`: Specific market condition or counter-factor challenging the assumption.
  - `invalidationCondition`: Observable market event that would invalidate the assumption.
  - `supportingEvidenceIds`: Array of evidence IDs.
  - `opposingEvidenceIds`: Array of evidence IDs.
  - `createdAt`: ISO 8601 timestamp.
- **Invariants**:
  - Zero fake confidence scores. Status is strictly qualitative and evidence-linked.
  - `VALIDATED` is deliberately excluded as epistemically excessive for market analysis.

---

## 4. `EvidenceV1` & `EvidenceLedgerV1` (`src/core/contracts/evidence.ts`)

Normalized market observation with tamper-resistant provenance.

- **`EvidenceV1` Fields**:
  - `id`: Deterministic or unique evidence ID.
  - `thesisId`: Reference to thesis.
  - `claim`: Objective factual statement of what was observed (e.g. "ETH/BTC 24h volume down 14% while BTC open interest surged 8%").
  - `category`: `PRICE_ACTION` | `ORDERBOOK_DEPTH` | `FUNDING_RATE` | `OPEN_INTEREST` | `LIQUIDATION_FLOW` | `VOLATILITY_SURFACE` | `ON_CHAIN_ACTIVITY` | `MACRO_METRIC` | `SENTIMENT_METRIC` | `CORRELATION` | `OTHER`.
  - `stance`: Relative to thesis: `SUPPORTING` | `CONTRADICTING` | `NEUTRAL`.
  - `nature`: `NUMERIC` | `QUALITATIVE` | `DERIVED`.
  - `provenance`: Sourced attribution object:
    - `sourceName`: e.g. "Bitget Market API"
    - `sourceType`: `EXCHANGE_API` | `ON_CHAIN_INDEXER` | `NEWS_WIRE` | `DERIVED_ANALYTICS` | `PRIMARY_DOCUMENT`
    - `endpointOrLocator`: e.g. `/api/v2/mix/market/ticker?symbol=ETHUSDT`
    - `observedAt`: Real-world observation timestamp.
    - `retrievedAt`: Ingestion timestamp.
    - `validUntil`: Optional explicit expiry datetime.
    - `freshnessWindowSeconds`: Optional TTL window for freshness tier evaluation.
    - `contentHash`: Optional payload hash for tamper protection.
    - `rawSnapshot`: Key upstream data fields.
  - `value`: Optional numeric or string value.
  - `unit`: Optional unit (e.g. `bps`, `%`, `USD`).
  - `derivedFromEvidenceIds`: Array of parent evidence IDs if calculated.
  - `relatedAssumptionIds`: Array of assumption IDs this evidence touches.
  - `verifiable`: Boolean flag.
- **Freshness Invariant**:
  - Freshness is **not** stored as an immutable static boolean or enum on `EvidenceV1` (which would rot as time elapses).
  - Freshness is deterministically derived via domain helpers `deriveEvidenceFreshness(evidence, asOf)` and `isEvidenceStale(evidence, asOf)` relative to an explicit evaluation timestamp.
- **`EvidenceLedgerV1` Fields**:
  - `id`: Unique ledger ID.
  - `thesisId`: Linked thesis ID.
  - `items`: Array of `EvidenceV1`.
  - `summary`: Counts of total, supporting, contradicting, neutral, and `staleCountAtAssembly`.
  - `assembledAt`: ISO 8601 timestamp.

---

## 5. `ArgumentV1` (`src/core/contracts/argument.ts`)

Structured argument case for or against the thesis.

- **Fields**:
  - `id`: Argument ID.
  - `thesisId`: Linked thesis ID.
  - `stance`: `ADVOCATE` | `DISSENTER`.
  - `summary`: Core argument synthesis.
  - `points`: Array of structured points (`id`, `title`, `reasoning`, `evidenceIds`, `targetAssumptionIds`, `weight`).
  - `risksOrCounterweightsConsidered`: Counter-factors acknowledged.
  - `createdAt`: ISO 8601 timestamp.
- **Invariants**:
  - Each point must reference at least one valid evidence ID from the `EvidenceLedgerV1`.

---

## 6. `StressScenarioV1` & `InvalidationConditionV1` (`src/core/contracts/stress-scenario.ts`)

- **`StressScenarioV1`**: Domain-general scenario analysis:
  - `scenarioType`: `MACRO_REGIME_CHANGE` | `LIQUIDITY_SHOCK` | `POSITIONING_REVERSAL` | `LIQUIDATION_CASCADE` | `VOLATILITY_EXPANSION` | `CORRELATION_BREAKDOWN` | `ASSET_SPECIFIC_EVENT` | `MARKET_STRUCTURE_DETERIORATION` | `OTHER`.
  - `plausibility`: `HIGH` | `MEDIUM` | `LOW` | `TAIL_RISK`.
  - `transmissionMechanism`: Concrete transmission path to price/positioning.
  - `consequenceForThesis`: How the scenario breaks the hypothesis.

- **`InvalidationConditionV1`**: Discriminated union by `type`:
  - **`QUANTITATIVE`**: Observable numeric metric and threshold (e.g. "ETH/BTC closes below 0.0315 on 4H candle").
    - Requires: `targetMetric`, `triggerThreshold`, `timeframe`, `observableDataSource`.
  - **`QUALITATIVE`**: Observable real-world or market event (e.g. "Scheduled hard fork cancelled by core devs").
    - Requires: `observableEvent`, `verificationSource`, optional `expectedWindow`.

---

## 7. `HumanDecisionV1` (`src/core/contracts/human-decision.ts`)

The human trader's explicit verdict on the brief.

- **Fields**:
  - `id`: Decision ID.
  - `runId`: Linked run ID.
  - `thesisId`: Linked thesis ID.
  - `decision`: `PROCEED` | `WATCH` | `PASS`.
  - `attribution`:
    - `actorType`: Must be literal `'HUMAN_OPERATOR'`.
    - `operatorId`: Identifier of the human trader.
    - `clientSessionId`: Optional session reference.
  - `notes`: Optional trader reflection.
  - `decidedAt`: ISO 8601 timestamp.
- **Invariants**:
  - AI and automated pipelines **cannot** create or emit this object. It is strictly human-attested.
  - The domain object does not require UI presentation artifacts (such as `confirmedDisclaimer: true`).

---

## 8. `DissentBriefV1` (`src/core/contracts/brief.ts`)

The signature 11-section research artifact:
1. `originalThesis`: Verbatim user input string.
2. `structuredThesis`: `StructuredThesisV1`.
3. `supportingEvidence`: Array of `EvidenceV1`.
4. `theDissent`: `ArgumentV1` with stance `'DISSENTER'`.
5. `assumptions`: Array of `AssumptionV1`.
6. `contradictions`: Array of `ContradictionPointV1`.
7. `stressScenarios`: Array of `StressScenarioV1`.
8. `invalidationConditions`: Array of `InvalidationConditionV1` (quantitative or qualitative).
9. `unknowns`: Array of unresolved questions/blind spots.
10. `evidenceLedger`: `EvidenceLedgerV1`.
11. `humanDecision`: Starts as `null`; only populated after human operator review.
- **Invariants**:
  - `theDissent` stance must be `'DISSENTER'`.
  - Fixed legal disclaimer string embedded.

---

## 9. `AnalysisRunV1` (`src/core/contracts/run.ts`)

Lifecycle coordinator state:
- **Stages**: `DRAFT` -> `STRUCTURING` -> `RESEARCHING` -> `ARGUING` -> `STRESS_TESTING` -> `SYNTHESIZING` -> `COMPLETED` (or `FAILED` from any stage).
- **Retries**: A `FAILED` run can re-enter any processing stage.
- **Terminal States**: `COMPLETED`, `FAILED` (unless explicitly retried).

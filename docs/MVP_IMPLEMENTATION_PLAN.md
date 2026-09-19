# Dissent MVP Implementation Plan (Hackathon Execution <48h)

> This document defines the rapid execution roadmap for the core engineering phase led by Codex / GPT-5.6 Sol High tomorrow.

---

### Phase 1: Real Bitget Market-Data Integration
- **Status**: Implemented and live-verified for the V1 reference assets BTC and ETH.
- **Endpoints**: Current public V3 `instruments`, `tickers`, and `candles` endpoints. One API generation is used consistently for spot and USDT futures.
- **Coverage**: BTC/USDT and ETH/USDT spot snapshots/history; optional USDT-perpetual funding and open-interest fields; deterministic interval returns, ETH-minus-BTC return spread, and exact ETH/BTC relative return.
- **Deliberate limitation**: The V3 ticker page exposes `openInterest` without defining its unit. The value is preserved as `BITGET_NATIVE_OPEN_INTEREST` with an explicit metadata limitation rather than inventing a unit. Order-book analysis is outside this focused Phase 1 proof.
- **Verification**: Unit tests use realistic V3 fixtures and mocked fetch. Run the opt-in live proof with `npm run test:integration:bitget`; it requires outbound access to `api.bitget.com` but no key.

---

### Phase 2: Grounded Intelligence Loop
- **Status**: Implemented for the single canonical V1 thesis, `ETH/BTC`; other markets fail explicitly.
- **Logic**: DeepSeek Responses JSON Schema output parses the verbatim thesis into `StructuredThesisV1` and explicit/inferred `AssumptionV1` items. The existing Bitget desk supplies the immutable ledger. Separate Advocate and Dissenter calls select ledger IDs and produce qualitative interpretations; the server inserts exact evidence claims and owns IDs, timestamps, and stances.
- **Safety**: No AI tools, autonomous research, trading operations, fabricated numeric facts, human decisions, or partial-research argumentation.
- **Verification**: Offline provider fixtures cover malformed outputs, injection attempts, invented/mismatched references, semantic evidence mismatch, missing evidence, timeouts, and partial research. Run the credentialed end-to-end proof with `DEEPSEEK_API_KEY=... npm run test:integration:ai`.

---

### Phase 3: Evidence Normalization & Evidence Ledger (foundation completed in Phase 1)
- **Objective**: Connect market observations to the structured thesis.
- **Logic**:
  - Ingest raw Bitget data snapshots.
  - Convert into typed `EvidenceV1` items with strict `EvidenceProvenanceV1`.
  - Preserve raw market observations as `NEUTRAL`; Advocate and Dissenter interpretations remain separate `ArgumentV1` artifacts rather than rewriting evidence stance.
  - Construct the immutable `EvidenceLedgerV1`.
- **Verification**: Assert that all items satisfy `assertEvidenceLedgerIntegrity`.

---

### Phase 4: Advocate + Dissenter Adversarial Desks (completed in Phase 2 slice)
- **Advocate Desk**: Builds the strongest interpretation permitted by the supplied ledger while acknowledging limits.
- **Dissenter Desk**: Challenges the thesis and assumptions without treating absent or neutral evidence as proof of contradiction.
- **Verification**: Enforces evidence and thesis linkage plus deterministic fact quotation.

---

### Phase 5: Assumption Stress-Testing Desk (completed in Phase 3)
- **Status**: Implemented through `StressTestingPort` with real DeepSeek structured output.
- **Logic**:
  - Evaluate every supplied explicit or inferred assumption against the ledger and both adversarial arguments.
  - Produce two or three materially distinct, explicitly hypothetical scenarios with assumption/evidence linkage and uncertainty.
  - Formulate qualitative observable invalidation conditions when no defensible numerical threshold is available.
- **Verification**: Enforce categorical status/evidence consistency, reference integrity, non-numeric model prose, and thesis-review rather than execution semantics.

---

### Phase 6: Dissent Brief Synthesis (completed in Phase 3)
- **Status**: Implemented through `SynthesisPort` and the complete intelligence loop.
- **Logic**: DeepSeek classifies existing dissent and unresolved gaps; the server deterministically assembles all canonical sections without generating new evidence.
- **Enforcement**: `assertGeneratedBriefInvariants` validates thesis/evidence/reference integrity, prevents false contradictions, and requires `humanDecision` to remain `null`.
- **Verification**: Run `DEEPSEEK_API_KEY=... npm run test:integration:ai` for the live five-call DeepSeek + Bitget Dissent Brief proof.

---

### Phase 7: Application API & Anonymous Persistence (completed in Phase 4)
- **API**: Synchronous `POST /api/research` and explicit `POST /api/decisions` application boundaries.
- **Persistence**: Browser-local for the anonymous hackathon MVP; there is deliberately no process-local server store or public run-retrieval endpoint.
- **Runtime**: Node.js Vercel Function with Fluid Compute and a 120-second research route budget.
- **Protection**: Fail-closed deployment switch, strict body/schema limits, same-origin browser policy, sanitized errors, and required Vercel WAF rate limiting.

---

### Phase 8: Premium Frontend Interface
- **Objective**: High-density, institutional-grade UI for the AI Trading Desk.
- **Components**:
  - Thesis input console with quick-fill presets.
  - Live progress stepper through the 8 stages.
  - Interactive Dissent Brief view:
    - Side-by-side Advocate vs. Dissenter comparison.
    - Sourced Evidence Ledger with raw JSON snapshot inspector.
    - Assumption stress-test matrix.
  - The Human Call modal (bold PROCEED, WATCH, PASS action bar).

---

### Phase 9: Hardening & Production Deployment
- **Objective**: Production readiness on Vercel.
- **Checks**:
  - Rate limiting and caching on external Bitget calls.
  - Comprehensive fallback handling for market API outages.
  - Complete test suite passing in CI.

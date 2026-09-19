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

### Phase 2: Thesis Structuring Engine
- **Objective**: Implement `ThesisStructuringPort` in `src/server/ai/`.
- **Logic**: Use structured model outputs (Zod schema constraint) to parse trader prompts into `StructuredThesisV1` and identify 2–4 explicit or inferred `AssumptionV1` items.
- **Verification**: Test with diverse trader inputs (pairs like ETH/BTC, directional altcoin bets, macro hedged plays).

---

### Phase 3: Evidence Normalization & Evidence Ledger (foundation completed in Phase 1)
- **Objective**: Connect market observations to the structured thesis.
- **Logic**:
  - Ingest raw Bitget data snapshots.
  - Convert into typed `EvidenceV1` items with strict `EvidenceProvenanceV1`.
  - Calculate `EvidenceStanceV1` (`SUPPORTING`, `CONTRADICTING`, `NEUTRAL`) relative to the thesis claim.
  - Construct the immutable `EvidenceLedgerV1`.
- **Verification**: Assert that all items satisfy `assertEvidenceLedgerIntegrity`.

---

### Phase 4: Advocate + Dissenter Adversarial Desks
- **Objective**: Implement `ArgumentationPort`.
- **Advocate Desk**: Builds structured, evidence-backed arguments validating the thesis.
- **Dissenter Desk**: Deliberately constructs the strongest counter-thesis, attacking specific assumptions using contradictory evidence items from the ledger.
- **Verification**: Enforce `assertArgumentEvidenceGrounding` (no arguments without evidence IDs).

---

### Phase 5: Assumption Stress-Testing Desk
- **Objective**: Implement `StressTestingPort`.
- **Logic**:
  - Evaluate assumptions against 3 regime shocks (`LIQUIDITY_SHOCK`, `VOLATILITY_SPIKE`, `CORRELATION_BREAKDOWN`).
  - Formulate concrete, observable `InvalidationConditionV1` metrics and thresholds.
- **Verification**: Verify that invalidation conditions are quantifiable and monitorable.

---

### Phase 6: Dissent Brief Synthesis
- **Objective**: Implement `SynthesisPort` to assemble `DissentBriefV1`.
- **Logic**: Combine all structured components into the canonical 11 sections.
- **Enforcement**: Validate `assertBriefInvariants`. Ensure `humanDecision` is strictly `null`.

---

### Phase 7: Session Persistence & History
- **Objective**: In-memory or lightweight KV store for analysis runs.
- **Endpoints**:
  - `POST /api/runs`: Create analysis run.
  - `GET /api/runs/:id`: Poll/stream progress through stages.
  - `POST /api/runs/:id/decision`: Commit human decision (`PROCEED` | `WATCH` | `PASS`).

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

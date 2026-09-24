# Dissent

> **Stress-test the trade before the market does.**

Dissent is an evidence-grounded AI research desk for native US equities. It turns a trader's market thesis into an adversarial research brief—building the case for and against the idea, testing its underlying assumptions, and surfacing what the available data cannot establish—while leaving the final decision strictly to the trader.

Built for the **Bitget AI Base Camp Hackathon S2** (AI Trading Desk track).

---

## What Dissent Does

1. **Thesis interpretation** — Parses a natural-language equity thesis into a structured market, direction, and set of testable assumptions.
2. **Market evidence retrieval** — Queries Bitget's equity MCP service for source-attributed price quotes and fundamental valuation ratios.
3. **Adversarial argumentation** — Constructs an Advocate case (supporting the thesis) and a Dissenter case (opposing it), both grounded exclusively in collected evidence.
4. **Assumption stress testing** — Evaluates each extracted assumption against the evidence and generates plausibility-labelled stress scenarios.
5. **Research Brief** — Assembles a validated `DissentBriefV1` containing all evidence, arguments, and assumption assessments.
6. **Human decision** — The trader explicitly records PROCEED, WATCH, or PASS. The AI never decides.

---

## Supported Markets

**Native US equities (eight stocks):**
NVDA · COIN · MSFT · MSTR · TSLA · AAPL · AMD · META

Single-stock directional theses only. Dissent does not support arbitrary tickers, tokenised stock trading, or autonomous order execution.

> The original BTC/ETH/SOL crypto research implementation remains in the codebase but is not the focus of the current product.

---

## Market Evidence and Data Integrity

Evidence is collected via the **Bitget Equity MCP** JSON-RPC service (`https://agent.bitget.com/mcp`), read-only.

Per stock, Dissent collects where available:

| Evidence type | Observation type |
|---|---|
| Last price | `LAST_PRICE` |
| Source-reported prior-close change | `SESSION_PRICE_CHANGE` |
| Session trading volume | `SESSION_VOLUME` |
| Market capitalisation | `MARKET_CAPITALIZATION` |
| Trailing twelve-month P/E | `VALUATION_PE_TTM` |
| Last-year reported P/E | `VALUATION_PE_LYR` |
| Price-to-book | `VALUATION_PB_RATIO` |
| EV/EBITDA | `VALUATION_EV_EBITDA` |
| Trailing twelve-month P/S | `VALUATION_PS_TTM` |

**Honesty constraints enforced in code:**

- Quote `observedAt` is `null` — the MCP response does not provide a trade observation timestamp; retrieval time does not prove when the trade occurred.
- Valuation records preserve source-reported period-ending dates without claiming independent verification of SEC filing dates.
- Missing or inapplicable valuation fields are recorded as coverage gaps, not fabricated.
- Evidence record hashes (`sha256Canonical`) are content fingerprints for ledger integrity, not independent authentication of the underlying market data.

---

## AI Architecture

**Model:** DeepSeek (default: `deepseek-flash`, configurable via `DEEPSEEK_MODEL`).

**Pipeline stages (single synchronous request):**

1. Thesis structuring — structured output against a Zod schema
2. Grounded argument selection — Advocate and Dissenter, evidence IDs required
3. Assumption assessment — each assumption evaluated against the evidence ledger
4. Stress testing — plausibility-labelled scenarios
5. Synthesis — final `DissentBriefV1` with `humanDecision: null`

No LLM prompt populates or selects the human trading decision. No model call receives trade-execution tools, account credentials, or an arbitrary API host.

---

## Persistence

Research Briefs are saved to **browser localStorage** only. There is no server-side storage, no cross-device sync, and no refresh-safe recovery after a failed request. The application accurately reflects these limitations at runtime.

---

## Local Development

### Prerequisites

- Node.js ≥ 20.0.0 (tested on v24.18.0)
- npm ≥ 10.0.0

### Installation

```bash
npm install
cp .env.example .env.local   # then fill in DEEPSEEK_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes (for research) | DeepSeek Responses API key |
| `DEEPSEEK_MODEL` | No | Override model (default: `deepseek-flash`) |
| `RESEARCH_API_ENABLED` | Yes (`true`) | Gate that must be set to enable `POST /api/research` |
| `NEXT_PUBLIC_APP_URL` | No | Base URL for the app (default: `http://localhost:3000`) |

> Bitget equity market data uses public, read-only MCP endpoints and requires no Bitget credentials.

---

## Verification

```bash
# Offline checks (no credentials required)
npm run lint
npm run typecheck
npm test
npm run build

# Live equity MCP proof (public data, no credentials)
RUN_EQUITY_LIVE=1 npx vitest run tests/integration/bitget-equity.live.test.ts --reporter=verbose

# Live DeepSeek + equity evidence complete Brief proof
DEEPSEEK_API_KEY=<key> RUN_AI_LIVE=1 npm run test:integration:ai

# Live application-route proof including human decision recording
DEEPSEEK_API_KEY=<key> npm run test:integration:api
```

---

## Documentation

- [`AGENTS.md`](./AGENTS.md) — Agent instructions and architectural non-negotiables
- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — Product requirements and non-goals
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Hexagonal boundaries and data flow
- [`docs/DATA_CONTRACTS.md`](./docs/DATA_CONTRACTS.md) — Schema breakdowns and invariants
- [`docs/API_INTEGRATION.md`](./docs/API_INTEGRATION.md) — Frontend contract, persistence limits, and deployment requirements

# Dissent

> **Stress-test the trade before the market does.**

Dissent is an AI Trading Desk that turns a trader's market thesis into an evidence-backed adversarial research brief while leaving the final decision strictly to the trader. Built for the **Bitget AI x Crypto Hackathon** (AI Trading Desk track).

---

## Engineering Foundation Status

- **Framework**: Next.js 16.3.4 (App Router, React 19, Strict TypeScript)
- **Domain Contracts**: Zod V1 runtime contracts (`src/core/contracts/`)
- **Domain Invariants**: Strict human-decision attribution, evidence ledger grounding, verbatim preservation (`src/core/domain/`)
- **Boundaries**: Port definitions for Bitget Market Desk and Semantic AI Desk (`src/server/`)
- **Market Evidence**: Live-verified, read-only Bitget V3 adapter for BTC/USDT, ETH/USDT, and separately derived ETH/BTC return spread and relative return
- **Intelligence Loop**: Complete server-only DeepSeek + Bitget research loop through assumption stress testing and a validated `DissentBriefV1`
- **Documentation**: Specifications, architectural diagrams, and contracts located in `docs/`

---

## Local Development Setup

### Prerequisites
- Node.js >= 20.0.0 (tested on v24.18.0)
- npm >= 10.0.0

### Installation
```bash
# Clone and install dependencies
npm install

# Setup environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Verification Commands

```bash
# Run unit tests
npm test

# Run strict typecheck
npm run typecheck

# Run linter
npm run lint

# Run production build
npm run build

# Explicit live Bitget proof (public data, no credentials)
npm run test:integration:bitget

# Explicit live DeepSeek + Bitget complete Dissent Brief proof
DEEPSEEK_API_KEY=your_key npm run test:integration:ai
```

The AI smoke defaults to `deepseek-flash` and can be overridden with `DEEPSEEK_MODEL`. It executes thesis structuring, Advocate, Dissenter, Stress Tester, and Synthesizer calls against live Bitget evidence. No model call receives tools, exchange credentials, an arbitrary host, or authority to create a human decision.

---

## Architecture & Specifications

For comprehensive documentation, see:
- [`AGENTS.md`](./AGENTS.md) — Autonomous agent instructions & strict non-negotiables
- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — Product requirements, user personas & non-goals
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Hexagonal boundaries & data flow
- [`docs/DATA_CONTRACTS.md`](./docs/DATA_CONTRACTS.md) — Schema breakdowns & invariants
- [`docs/MVP_IMPLEMENTATION_PLAN.md`](./docs/MVP_IMPLEMENTATION_PLAN.md) — 48-hour build phases

# Product Specification: Dissent

## 1. Product Overview

**Name**: Dissent  
**Positioning**: Stress-test the trade before the market does.  
**Track**: Bitget AI x Crypto Hackathon — AI Trading Desk Track  

Dissent is an AI Trading Desk designed to stress-test discretionary crypto trading ideas. Discretionary traders often suffer from confirmation bias: after forming a market thesis, they instinctively search for data that validates their conviction while ignoring contradictory indicators, regime vulnerabilities, and unstated assumptions.

Dissent systematically breaks this bias by acting as an adversarial institutional research desk. It extracts structured hypotheses, pulls empirical market evidence from Bitget, generates both an advocate case and the strongest credible counter-case, tests latent assumptions, and delivers an objective **Dissent Brief**. 

Crucially, **the AI researches and challenges; the human makes the trading decision.**

---

## 2. Target User & Persona

- **The Systematic-Discretionary Trader**: Active crypto trader who originates their own thesis (e.g. "ETH will outperform BTC on rotation", "SOL funding is overheated") but needs rigorous institutional pushback before committing capital.
- **Crypto Fund Analyst**: Needs to write clear investment memos that highlight risk factors, invalidation levels, and counter-arguments rather than one-sided pitches.

---

## 3. The Problem

1. **Confirmation Bias**: Traders look for reasons to enter, not reasons to stay out or hedge.
2. **Hidden Assumptions**: Theses rely on implicit axioms (e.g. "BTC dominance stays flat", "liquidity will absorb sell pressure") that are never surfaced or stress-tested.
3. **Hallucinated Market Data in Generic AI**: Conventional LLMs hallucinate numbers, prices, and volumes without verifiable provenance or real-time grounding.
4. **Black-Box AI Signals**: Bots that output "85% BUY" create false confidence, lack accountability, and fail when regime shifts invalidate the hidden model assumptions.

---

## 4. Canonical User Workflow

```
1. Trader Thesis Submission
   Trader inputs raw market conviction (e.g. "ETH will outperform BTC over the next 48h because risk appetite is improving").
       ↓
2. Thesis Structuring
   Extracts assets (ETH/BTC), direction (RELATIVE_LONG), time horizon (48h), catalysts, and initial assumptions.
       ↓
3. Parallel Evidence Gathering
   Market Desk fetches real-time Bitget orderbooks, tickers, funding rates, and open interest into an immutable Evidence Ledger.
       ↓
4. Adversarial Argumentation
   - Advocate Desk: Builds the strongest grounded thesis in favor of the trade.
   - Dissenter Desk: Builds the strongest grounded counter-thesis attacking the trade.
       ↓
5. Assumption Stress Testing
   Evaluates explicit and inferred assumptions against macro/liquidity stress scenarios and calculates concrete invalidation conditions.
       ↓
6. Dissent Brief Synthesis
   Compiles the signature 11-section research artifact.
       ↓
7. Human Call (PROCEED / WATCH / PASS)
   The trader reviews the brief and explicitly records their human decision.
```

---

## 5. MVP Scope (<48-Hour Hackathon Build)

- **Input**: Free-form text submission of market thesis.
- **Market Data Port**: Real Bitget V2 market data (spot & perpetual futures tickers, 24h stats, funding rates, orderbook depth).
- **Core Orchestration**: Multi-stage pipeline with verifiable state progression.
- **Signature Output**: 11-section Dissent Brief with complete evidence lineage.
- **Human Call Interface**: Explicit human choice among `PROCEED`, `WATCH`, or `PASS` with optional rationale.

---

## 6. Explicit Non-Goals

1. **Autonomous Trading Bot**: Dissent never places orders or manages exchange keys with trade permissions.
2. **BUY/SELL Signal Engine**: Dissent never instructs the trader what to execute.
3. **Generic Crypto Chatbot**: No conversational small talk; every run generates a structured research artifact.
4. **Arbitrary Percentage Engine**: No ungrounded "92% bullish probability" scores.
5. **Order Execution & Routing**: No smart order routing, no automated order slicing.

---

## 7. Success Criteria

1. **Zero Hallucinated Metrics**: Every numerical market fact in the brief traces to a timestamped Bitget API observation in the Evidence Ledger.
2. **High-Signal Dissent**: The counter-case must identify at least one non-obvious assumption or market headwind that the trader did not state.
3. **Human Invariant Integrity**: Zero brief runs ever produce an automated recommendation.
4. **Execution Speed**: Full adversarial brief generation completes within standard discretionary pre-trade evaluation windows (<60 seconds).

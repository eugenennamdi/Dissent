export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0d0f12] text-[#e1e4ea] flex flex-col justify-between p-8 md:p-16 font-mono selection:bg-white selection:text-black">
      <header className="flex justify-between items-center text-xs tracking-widest text-[#7d8590] uppercase border-b border-[#21262d] pb-4">
        <span>Dissent // AI Trading Desk</span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Foundation Active
        </span>
      </header>

      <div className="max-w-3xl my-auto py-12">
        <div className="text-xs uppercase tracking-widest text-[#7d8590] mb-3">
          Bitget AI x Crypto Hackathon
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 font-sans">
          Stress-test the trade before the market does.
        </h1>
        <p className="text-sm md:text-base text-[#9da7b3] leading-relaxed mb-8 max-w-2xl font-sans">
          Dissent transforms subjective market convictions into structured, verifiable hypotheses,
          gathers immutable market evidence, constructs adversarial counter-cases, and delivers a rigorous
          Dissent Brief. The AI challenges; the human decides.
        </p>

        <div className="border border-[#30363d] bg-[#161b22] p-5 text-xs text-[#8b949e] space-y-2">
          <div className="text-white font-medium">Engineering Foundation Phase (Night 1)</div>
          <div>✓ Core domain contracts & Zod schemas formalized</div>
          <div>✓ Strict domain invariants & human-decision attribution active</div>
          <div>✓ MarketDesk & AI Analyst boundary ports defined</div>
          <div>✓ Zero mock data, zero hallucinated state, zero premature UI</div>
          <div className="text-[#58a6ff] pt-2">
            Status: Ready for Codex / GPT-5.6 Sol High core engine implementation.
          </div>
        </div>
      </div>

      <footer className="text-xs text-[#484f58] border-t border-[#21262d] pt-4 flex flex-col md:flex-row justify-between gap-2">
        <span>Decision-support research infrastructure. Not financial advice. Not an automated execution bot.</span>
        <span>Version 0.1.0-alpha</span>
      </footer>
    </main>
  );
}

export const SANITY_MCP_INIT_RESPONSE = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'bitget-mcp-server', version: '4.0.5' },
  },
};

export const SANITY_MCP_QUOTE_RECORD = {
  symbol: 'NVDA',
  last_price: 222.9272,
  open: 225.22,
  high: 225.53,
  low: 222.28,
  close: 222.9272,
  volume: 897562,
  prev_close: 225.0409,
  change: -2.1137,
  change_percent: -0.009392514871741068,
  total_shares: 24100000000,
  float_shares: 24100000000,
  total_market_cap: 5372545520000,
  float_market_cap: 5372545520000,
  pb: 23.462536771128114,
  turnover_rate: 0.0037243236514522817,
  amplitude: 1.444181924263545,
};

export const SANITY_MCP_QUOTE_RESPONSE = {
  jsonrpc: '2.0',
  id: 2,
  result: {
    structuredContent: {
      status_code: 200,
      success: true,
      data: {
        provider: 'bitget_data',
        results: [SANITY_MCP_QUOTE_RECORD],
      },
    },
  },
};

export const SANITY_MCP_RATIOS_RECORD = {
  symbol: 'NVDA',
  period_ending: '2026-09-23',
  pe: 75.6829,
  pe_ttm_ed: 28.597,
  pe_lyr: 45.9391,
  pb: 69.532,
  pb_mrq: 24.088,
  ps: 42.2674,
  ps_ttm_ed: 18.2057,
  pcf: 86.0642,
  pcf_ttm_ed: 41.0518,
  peg_his: null,
  ev1: 37437245580600,
  ev2: 37285263828900,
  ent_multi: 65.7862,
  tmv_usd: 5515767000000,
  div_yield_12m: 0.1223,
  time: 1790121600000,
};

export const SANITY_MCP_RATIOS_RESPONSE = {
  jsonrpc: '2.0',
  id: 3,
  result: {
    structuredContent: {
      status_code: 200,
      success: true,
      data: {
        provider: 'bitget_data',
        results: [SANITY_MCP_RATIOS_RECORD],
      },
    },
  },
};

export const SANITY_MCP_PARTIAL_RATIOS_RECORD = {
  symbol: 'NVDA',
  period_ending: '2026-09-23',
  time: 1790121600000,
  pe_ttm_ed: 28.597,
  // pe_lyr, ent_multi, pb_mrq missing or null
  pe_lyr: null,
  ent_multi: null,
  pb: 23.46,
};

export const SANITY_MCP_PARTIAL_RATIOS_RESPONSE = {
  jsonrpc: '2.0',
  id: 4,
  result: {
    structuredContent: {
      status_code: 200,
      success: true,
      data: {
        provider: 'bitget_data',
        results: [SANITY_MCP_PARTIAL_RATIOS_RECORD],
      },
    },
  },
};

export const SANITY_MCP_TOOL_ERROR_RESPONSE = {
  jsonrpc: '2.0',
  id: 5,
  result: {
    structuredContent: {
      status_code: 500,
      success: false,
      error: 'Upstream gateway timeout',
    },
  },
};

export const SANITY_MCP_JSONRPC_ERROR_RESPONSE = {
  jsonrpc: '2.0',
  id: 6,
  error: {
    code: -32601,
    message: 'Method not found',
  },
};

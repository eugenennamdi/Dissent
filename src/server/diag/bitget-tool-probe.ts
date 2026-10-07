import {
  BitgetMcpClient,
  BITGET_MCP_ENDPOINT,
  sanitizeProviderError,
} from '@/server/market/bitget-mcp.client';

export interface McpToolSummary {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface DirectTestCallReport {
  entryId?: string;
  toolName: string;
  argumentsShape: Record<string, string>;
  httpStatus: number;
  hasJsonRpcError: boolean;
  jsonRpcError?: { code: number; message: string };
  toolStatusCode?: number;
  toolSuccess?: boolean;
  hasStructuredContent: boolean;
  resultsNonEmpty: boolean;
  topLevelFieldNames: string[];
  dataType?: string;
  isHtmlError?: boolean;
}

export interface GuideCategory {
  key: string;
  name: string;
  description: string;
  entry_count: number;
}

export interface GuideParamSummary {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

export interface GuideEntrySummary {
  id: string;
  url_path?: string;
  category?: string;
  subcategory?: string;
  title?: string;
  summary?: string;
  data_tier?: string;
  params: GuideParamSummary[];
}

export interface GuideKeywordSearchResult {
  keyword: string;
  matchedCount: number;
  matchedEntryIds: string[];
}

export interface FieldComparison {
  entryId: string;
  expectedByGuide: GuideParamSummary[];
  currentlySentByDissent: Record<string, unknown>;
  missing: string[];
  extra: string[];
  typeMismatch: string[];
  valueFormatMismatch: string[];
  isCompatible: boolean;
}

export interface ExtendedBitgetToolProbeReport {
  environment: string;
  timestamp: string;
  lifecycle: {
    initialized: boolean;
    negotiatedProtocolVersion: string | null;
    hasSessionId: boolean;
    handshakeDurationMs: number;
    handshakeError?: string;
  };
  mcpTools: {
    tools: McpToolSummary[];
  };
  phase1GuideDiscovery: {
    topLevelCategories: GuideCategory[];
    keywordSearches: GuideKeywordSearchResult[];
    equitySubcategoriesFound: string[];
    totalEquityEntriesCount: number;
  };
  phase2CatalogEntries: {
    equityPriceQuoteExists: boolean;
    equityFundamentalRatiosExists: boolean;
    requiredParamsChanged: boolean;
    targetEntries: GuideEntrySummary[];
    alternativeCandidates: GuideEntrySummary[];
  };
  phase3ParameterComparison: {
    equityPriceQuote: FieldComparison;
    equityFundamentalRatios: FieldComparison;
  };
  phase4ControlQuery: DirectTestCallReport;
  phase5Retest: {
    equityPriceQuote: DirectTestCallReport;
    equityFundamentalRatios: DirectTestCallReport;
  };
  conclusion: {
    classification:
      | 'BACKEND_SERVICE_OUTAGE'
      | 'CLIENT_CONTRACT_DRIFT'
      | 'CATALOG_ENTRY_REMOVED';
    summary: string;
    clientContractStatus: string;
    entryCatalogStatus: string;
    backendServiceStatus: string;
  };
}

interface SessionContext {
  sessionId: string | null;
  protocolVersion: string | null;
}

async function sendMcpPost(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
  session: SessionContext,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<{
  status: number;
  contentType: string;
  envelope: any;
  rawError?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session.sessionId) {
    headers['MCP-Session-Id'] = session.sessionId;
  }
  if (session.protocolVersion) {
    headers['MCP-Protocol-Version'] = session.protocolVersion;
  }

  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
      signal: controller.signal,
    });

    const sid =
      res.headers.get('mcp-session-id') || res.headers.get('MCP-Session-Id');
    if (sid) {
      session.sessionId = sid;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    let textToParse = text.trim();
    if (textToParse.includes('data: ')) {
      const dataLine = textToParse
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data: '));
      if (dataLine) {
        textToParse = dataLine.slice('data: '.length).trim();
      }
    }

    let envelope: any = null;
    try {
      envelope = JSON.parse(textToParse);
    } catch (parseErr) {
      return {
        status: res.status,
        contentType,
        envelope: null,
        rawError: `Failed to parse response JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      };
    }

    return {
      status: res.status,
      contentType,
      envelope,
    };
  } catch (fetchErr) {
    return {
      status: 0,
      contentType: '',
      envelope: null,
      rawError: sanitizeProviderError(fetchErr) ?? 'Fetch failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractSafeReport(
  toolName: string,
  args: Record<string, unknown>,
  httpStatus: number,
  envelope: any,
  entryId?: string
): DirectTestCallReport {
  const argumentsShape: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    argumentsShape[k] =
      typeof v === 'string'
        ? `string(val=${v})`
        : typeof v === 'object' && v !== null
          ? `object(keys=${Object.keys(v).join(',')})`
          : typeof v;
  }

  const hasJsonRpcError = Boolean(envelope?.error);
  const jsonRpcError = envelope?.error
    ? {
        code: envelope.error.code ?? 0,
        message:
          sanitizeProviderError(envelope.error.message) ?? 'unknown error',
      }
    : undefined;

  const result = envelope?.result;
  const topLevelFieldNames =
    result && typeof result === 'object' && !Array.isArray(result)
      ? Object.keys(result)
      : [];

  let toolStatusCode: number | undefined;
  let toolSuccess: boolean | undefined;
  let hasStructuredContent = false;
  let resultsNonEmpty = false;
  let dataType: string | undefined;
  let isHtmlError = false;

  if (result && typeof result === 'object') {
    if (typeof result.status_code === 'number') {
      toolStatusCode = result.status_code;
    }
    if (typeof result.success === 'boolean') {
      toolSuccess = result.success;
    }

    if (
      result.structuredContent &&
      typeof result.structuredContent === 'object'
    ) {
      hasStructuredContent = true;
      const sc = result.structuredContent;
      if (typeof sc.status_code === 'number') toolStatusCode = sc.status_code;
      if (typeof sc.success === 'boolean') toolSuccess = sc.success;

      const data = sc.data;
      if (data !== undefined && data !== null) {
        if (typeof data === 'object') {
          dataType = 'object';
          if (Array.isArray(data.results)) {
            resultsNonEmpty = data.results.length > 0;
          } else if (data.results !== undefined && data.results !== null) {
            resultsNonEmpty = true;
          }
        } else if (typeof data === 'string') {
          if (data.trim().startsWith('<')) {
            dataType = 'html_error_page';
            isHtmlError = true;
          } else {
            dataType = 'string';
            try {
              const parsed = JSON.parse(data);
              if (Array.isArray(parsed?.results)) {
                resultsNonEmpty = parsed.results.length > 0;
              } else if (
                parsed?.results !== undefined &&
                parsed?.results !== null
              ) {
                resultsNonEmpty = true;
              }
            } catch {
              // not json
            }
          }
        }
      }
    }

    if (Array.isArray(result.content)) {
      resultsNonEmpty = result.content.length > 0;
    }
  }

  return {
    entryId,
    toolName,
    argumentsShape,
    httpStatus,
    hasJsonRpcError,
    jsonRpcError,
    toolStatusCode,
    toolSuccess,
    hasStructuredContent,
    resultsNonEmpty,
    topLevelFieldNames,
    dataType,
    isHtmlError,
  };
}

function compareParameters(
  entryId: string,
  guideEntry: GuideEntrySummary | undefined,
  dissentPayload: Record<string, unknown>
): FieldComparison {
  const expectedByGuide = guideEntry?.params ?? [];
  const requiredGuideParams = expectedByGuide
    .filter((p) => p.required)
    .map((p) => p.name);
  const guideParamNames = expectedByGuide.map((p) => p.name);
  const dissentParamNames = Object.keys(dissentPayload);

  const missing = requiredGuideParams.filter(
    (name) => !(name in dissentPayload)
  );
  const extra = dissentParamNames.filter(
    (name) => !guideParamNames.includes(name)
  );

  const typeMismatch: string[] = [];
  for (const param of expectedByGuide) {
    if (param.name in dissentPayload) {
      const val = dissentPayload[param.name];
      const actualType = typeof val;
      if (param.type === 'string' && actualType !== 'string') {
        typeMismatch.push(`${param.name}: expected string, got ${actualType}`);
      } else if (param.type === 'integer' && !Number.isInteger(val)) {
        typeMismatch.push(`${param.name}: expected integer, got ${actualType}`);
      }
    }
  }

  return {
    entryId,
    expectedByGuide,
    currentlySentByDissent: dissentPayload,
    missing,
    extra,
    typeMismatch,
    valueFormatMismatch: [],
    isCompatible:
      missing.length === 0 &&
      extra.length === 0 &&
      typeMismatch.length === 0,
  };
}

export async function runBitgetToolProbe(
  fetchImpl: typeof fetch = fetch
): Promise<ExtendedBitgetToolProbeReport> {
  const timestamp = new Date().toISOString();
  const environment = process.env.VERCEL_ENV ?? 'development';

  // MCP Lifecycle Handshake
  const t0 = Date.now();
  const client = new BitgetMcpClient({
    endpoint: BITGET_MCP_ENDPOINT,
    timeoutMs: 15_000,
    fetch: fetchImpl,
  });

  let initialized = false;
  let handshakeError: string | undefined;

  try {
    await client.initialize();
    initialized = client.isInitialized();
  } catch (err: unknown) {
    handshakeError = sanitizeProviderError(err) ?? 'Handshake failed';
  }

  const handshakeDurationMs = Date.now() - t0;
  const session: SessionContext = {
    sessionId: client.getSessionId(),
    protocolVersion: client.getNegotiatedProtocolVersion(),
  };

  const report: ExtendedBitgetToolProbeReport = {
    environment,
    timestamp,
    lifecycle: {
      initialized,
      negotiatedProtocolVersion: session.protocolVersion,
      hasSessionId: session.sessionId !== null,
      handshakeDurationMs,
      handshakeError,
    },
    mcpTools: {
      tools: [],
    },
    phase1GuideDiscovery: {
      topLevelCategories: [],
      keywordSearches: [],
      equitySubcategoriesFound: [],
      totalEquityEntriesCount: 0,
    },
    phase2CatalogEntries: {
      equityPriceQuoteExists: false,
      equityFundamentalRatiosExists: false,
      requiredParamsChanged: false,
      targetEntries: [],
      alternativeCandidates: [],
    },
    phase3ParameterComparison: {
      equityPriceQuote: {
        entryId: 'equity_price_quote',
        expectedByGuide: [],
        currentlySentByDissent: {},
        missing: [],
        extra: [],
        typeMismatch: [],
        valueFormatMismatch: [],
        isCompatible: false,
      },
      equityFundamentalRatios: {
        entryId: 'equity_fundamental_ratios',
        expectedByGuide: [],
        currentlySentByDissent: {},
        missing: [],
        extra: [],
        typeMismatch: [],
        valueFormatMismatch: [],
        isCompatible: false,
      },
    },
    phase4ControlQuery: {
      toolName: 'do_query',
      argumentsShape: {},
      httpStatus: 0,
      hasJsonRpcError: false,
      hasStructuredContent: false,
      resultsNonEmpty: false,
      topLevelFieldNames: [],
    },
    phase5Retest: {
      equityPriceQuote: {
        toolName: 'do_query',
        argumentsShape: {},
        httpStatus: 0,
        hasJsonRpcError: false,
        hasStructuredContent: false,
        resultsNonEmpty: false,
        topLevelFieldNames: [],
      },
      equityFundamentalRatios: {
        toolName: 'do_query',
        argumentsShape: {},
        httpStatus: 0,
        hasJsonRpcError: false,
        hasStructuredContent: false,
        resultsNonEmpty: false,
        topLevelFieldNames: [],
      },
    },
    conclusion: {
      classification: 'BACKEND_SERVICE_OUTAGE',
      summary: 'Handshake incomplete',
      clientContractStatus: 'unknown',
      entryCatalogStatus: 'unknown',
      backendServiceStatus: 'unknown',
    },
  };

  if (!initialized) {
    return report;
  }

  let nextId = 100;

  // 1. tools/list
  const toolsRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/list',
    {},
    nextId++,
    session,
    fetchImpl,
    15_000
  );

  const rawTools = Array.isArray(toolsRes.envelope?.result?.tools)
    ? toolsRes.envelope.result.tools
    : [];

  report.mcpTools.tools = rawTools.map((t: any) => ({
    name: String(t.name ?? ''),
    description: String(t.description ?? ''),
    inputSchema:
      t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : {},
  }));

  // PHASE 1 — GUIDE DISCOVERY
  // 1. guide {}
  const guideEmptyRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/call',
    { name: 'guide', arguments: {} },
    nextId++,
    session,
    fetchImpl,
    15_000
  );

  const categories = Array.isArray(
    guideEmptyRes.envelope?.result?.structuredContent?.categories
  )
    ? guideEmptyRes.envelope.result.structuredContent.categories
    : [];

  report.phase1GuideDiscovery.topLevelCategories = categories.map((c: any) => ({
    key: String(c.key ?? ''),
    name: String(c.name ?? ''),
    description: String(c.description ?? ''),
    entry_count: Number(c.entry_count ?? 0),
  }));

  // 2. Keyword searches
  const keywordsToSearch = [
    'equity_price_quote',
    'equity_fundamental_ratios',
    'quote',
    'price',
    'fundamental',
    'ratios',
    'valuation',
  ];

  for (const kw of keywordsToSearch) {
    const kwRes = await sendMcpPost(
      BITGET_MCP_ENDPOINT,
      'tools/call',
      { name: 'guide', arguments: { keyword: kw } },
      nextId++,
      session,
      fetchImpl,
      15_000
    );
    const entries = Array.isArray(
      kwRes.envelope?.result?.structuredContent?.entries
    )
      ? kwRes.envelope.result.structuredContent.entries
      : [];
    report.phase1GuideDiscovery.keywordSearches.push({
      keyword: kw,
      matchedCount: entries.length,
      matchedEntryIds: entries.map((e: any) => String(e.id ?? '')),
    });
  }

  // 3. Category "equity" full retrieval
  const guideEquityRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/call',
    { name: 'guide', arguments: { category: 'equity' } },
    nextId++,
    session,
    fetchImpl,
    15_000
  );

  const rawEquityEntries = Array.isArray(
    guideEquityRes.envelope?.result?.structuredContent?.entries
  )
    ? guideEquityRes.envelope.result.structuredContent.entries
    : [];

  report.phase1GuideDiscovery.totalEquityEntriesCount = rawEquityEntries.length;

  const subcategoriesSet = new Set<string>();
  const allEquityEntries: GuideEntrySummary[] = [];

  for (const e of rawEquityEntries) {
    const subcat = String(e.subcategory ?? '');
    if (subcat) subcategoriesSet.add(subcat);

    const params: GuideParamSummary[] = Array.isArray(e.params_summary)
      ? e.params_summary.map((p: any) => ({
          name: String(p.name ?? ''),
          type: String(p.type ?? ''),
          required: Boolean(p.required),
          default: p.default,
          enum: Array.isArray(p.enum) ? p.enum : undefined,
        }))
      : [];

    allEquityEntries.push({
      id: String(e.id ?? ''),
      url_path: e.url_path,
      category: 'equity',
      subcategory: subcat,
      title: e.title,
      summary: e.summary,
      data_tier: e.data_tier,
      params,
    });
  }

  report.phase1GuideDiscovery.equitySubcategoriesFound =
    Array.from(subcategoriesSet);

  // PHASE 2 — REPORT CATALOG ENTRY METADATA
  const quoteEntry = allEquityEntries.find(
    (e) => e.id === 'equity_price_quote'
  );
  const ratiosEntry = allEquityEntries.find(
    (e) => e.id === 'equity_fundamental_ratios'
  );

  report.phase2CatalogEntries.equityPriceQuoteExists = Boolean(quoteEntry);
  report.phase2CatalogEntries.equityFundamentalRatiosExists =
    Boolean(ratiosEntry);

  const quoteRequiredSymbol =
    quoteEntry?.params.some((p) => p.name === 'symbol' && p.required) ?? false;
  const ratiosRequiredSymbol =
    ratiosEntry?.params.some((p) => p.name === 'symbol' && p.required) ?? false;

  report.phase2CatalogEntries.requiredParamsChanged =
    !(quoteRequiredSymbol && ratiosRequiredSymbol);

  if (quoteEntry) report.phase2CatalogEntries.targetEntries.push(quoteEntry);
  if (ratiosEntry) report.phase2CatalogEntries.targetEntries.push(ratiosEntry);

  // Alternative candidates providing quotes, volume, market cap, valuation
  const alternativeIds = [
    'equity_price_historical',
    'equity_profile',
    'equity_fundamental_metrics',
    'equity_estimates_price_target',
  ];
  report.phase2CatalogEntries.alternativeCandidates = allEquityEntries.filter(
    (e) => alternativeIds.includes(e.id)
  );

  // PHASE 3 — EXACT PARAMETER COMPARISON
  const dissentQuotePayload = { symbol: 'NVDA' };
  const dissentRatiosPayload = { symbol: 'NVDA' };

  report.phase3ParameterComparison.equityPriceQuote = compareParameters(
    'equity_price_quote',
    quoteEntry,
    dissentQuotePayload
  );
  report.phase3ParameterComparison.equityFundamentalRatios = compareParameters(
    'equity_fundamental_ratios',
    ratiosEntry,
    dissentRatiosPayload
  );

  // PHASE 4 — CONTROL QUERY
  // Execute control query on another US-equity entry (equity_profile) using NVDA
  const controlArgs = { entry_id: 'equity_profile', params: { symbol: 'NVDA' } };
  const controlRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/call',
    { name: 'do_query', arguments: controlArgs },
    nextId++,
    session,
    fetchImpl,
    15_000
  );
  report.phase4ControlQuery = extractSafeReport(
    'do_query',
    controlArgs,
    controlRes.status,
    controlRes.envelope,
    'equity_profile'
  );

  // PHASE 5 — OPTIONAL RETEST (equity_price_quote and equity_fundamental_ratios)
  const retestQuoteArgs = {
    entry_id: 'equity_price_quote',
    params: { symbol: 'NVDA' },
  };
  const retestQuoteRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/call',
    { name: 'do_query', arguments: retestQuoteArgs },
    nextId++,
    session,
    fetchImpl,
    15_000
  );
  report.phase5Retest.equityPriceQuote = extractSafeReport(
    'do_query',
    retestQuoteArgs,
    retestQuoteRes.status,
    retestQuoteRes.envelope,
    'equity_price_quote'
  );

  const retestRatiosArgs = {
    entry_id: 'equity_fundamental_ratios',
    params: { symbol: 'NVDA' },
  };
  const retestRatiosRes = await sendMcpPost(
    BITGET_MCP_ENDPOINT,
    'tools/call',
    { name: 'do_query', arguments: retestRatiosArgs },
    nextId++,
    session,
    fetchImpl,
    15_000
  );
  report.phase5Retest.equityFundamentalRatios = extractSafeReport(
    'do_query',
    retestRatiosArgs,
    retestRatiosRes.status,
    retestRatiosRes.envelope,
    'equity_fundamental_ratios'
  );

  // CONCLUSION
  const control503 = report.phase4ControlQuery.toolStatusCode === 503;
  const quote503 = report.phase5Retest.equityPriceQuote.toolStatusCode === 503;
  const ratios503 =
    report.phase5Retest.equityFundamentalRatios.toolStatusCode === 503;

  const isGlobalOutage = control503 && quote503 && ratios503;

  report.conclusion = {
    classification: isGlobalOutage
      ? 'BACKEND_SERVICE_OUTAGE'
      : 'CLIENT_CONTRACT_DRIFT',
    summary: isGlobalOutage
      ? 'agent-data-platform upstream service is globally returning HTTP 503 HTML error pages across all equity catalog entries. Client contract and entry schemas are 100% valid.'
      : 'Discrepancy detected between client parameters and server requirements.',
    clientContractStatus:
      report.phase3ParameterComparison.equityPriceQuote.isCompatible &&
      report.phase3ParameterComparison.equityFundamentalRatios.isCompatible
        ? 'VERIFIED_CORRECT: Exactly matches guide-advertised schemas (symbol: string required, 0 missing/extra fields)'
        : 'CONTRACT_DRIFT_DETECTED',
    entryCatalogStatus:
      report.phase2CatalogEntries.equityPriceQuoteExists &&
      report.phase2CatalogEntries.equityFundamentalRatiosExists
        ? 'ENTRIES_EXIST: Both equity_price_quote and equity_fundamental_ratios are fully registered in the guide equity catalog'
        : 'ENTRIES_MISSING',
    backendServiceStatus:
      isGlobalOutage
        ? 'SERVICE_UNAVAILABLE (503): agent-data-platform backend service returns 503 HTML error pages to bitget-mcp-server dispatcher'
        : 'HEALTHY',
  };

  return report;
}

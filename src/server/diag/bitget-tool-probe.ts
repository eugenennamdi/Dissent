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
}

export interface DoQueryComparison {
  isExposed: boolean;
  dissentExpectedFields: string[];
  serverProperties: string[];
  serverRequired: string[];
  missingFromSchema: string[];
  extraInSchema: string[];
  propertyTypes: Record<string, string>;
}

export interface BitgetToolProbeReport {
  environment: string;
  timestamp: string;
  lifecycle: {
    initialized: boolean;
    negotiatedProtocolVersion: string | null;
    hasSessionId: boolean;
    handshakeDurationMs: number;
    handshakeError?: string;
  };
  toolDiscovery: {
    totalToolsCount: number;
    pagesFetched: number;
    targetToolPresence: Record<string, boolean>;
    tools: McpToolSummary[];
  };
  callContractAnalysis: {
    detectedCategory: 'DIRECT_TOOLS' | 'DISCOVERY_WRAPPER' | 'DO_QUERY' | 'UNKNOWN';
    summary: string;
    doQueryComparison?: DoQueryComparison;
  };
  testCalls: DirectTestCallReport[];
}

const TARGET_TOOL_NAMES = [
  'do_query',
  'equity_price_quote',
  'equity_fundamental_ratios',
  'available_tools',
  'search_tools',
  'call_tool',
  'activate_tools',
  'activate_category',
] as const;

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

function constructDirectToolArgs(
  inputSchema: Record<string, unknown>,
  symbolValue = 'NVDA'
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const properties =
    inputSchema.properties && typeof inputSchema.properties === 'object'
      ? (inputSchema.properties as Record<string, unknown>)
      : {};
  const propKeys = Object.keys(properties);

  const symbolKey = propKeys.find((k) =>
    ['symbol', 'ticker', 'stock', 'query', 'stock_symbol', 'asset'].includes(
      k.toLowerCase()
    )
  );

  if (symbolKey) {
    args[symbolKey] = symbolValue;
  } else if (propKeys.length > 0) {
    const required = Array.isArray(inputSchema.required)
      ? inputSchema.required
      : [];
    const firstRequired = required[0];
    const firstProp = propKeys[0];
    if (firstRequired && typeof firstRequired === 'string') {
      args[firstRequired] = symbolValue;
    } else if (firstProp) {
      args[firstProp] = symbolValue;
    } else {
      args['symbol'] = symbolValue;
    }
  } else {
    args['symbol'] = symbolValue;
  }
  return args;
}

function extractSafeReport(
  toolName: string,
  args: Record<string, unknown>,
  httpStatus: number,
  envelope: any
): DirectTestCallReport {
  const argumentsShape: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    argumentsShape[k] =
      typeof v === 'string' ? `string(val=${v})` : typeof v;
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
      if (data) {
        if (typeof data === 'object') {
          if (Array.isArray(data.results)) {
            resultsNonEmpty = data.results.length > 0;
          } else if (data.results !== undefined && data.results !== null) {
            resultsNonEmpty = true;
          }
        } else if (typeof data === 'string') {
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
            // malformed or non-JSON data
          }
        }
      }
    }

    if (Array.isArray(result.content)) {
      resultsNonEmpty = result.content.length > 0;
    }
  }

  return {
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
  };
}

export async function runBitgetToolProbe(
  fetchImpl: typeof fetch = fetch
): Promise<BitgetToolProbeReport> {
  const timestamp = new Date().toISOString();
  const environment = process.env.VERCEL_ENV ?? 'development';

  // PHASE 1: MCP Handshake Lifecycle
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

  const report: BitgetToolProbeReport = {
    environment,
    timestamp,
    lifecycle: {
      initialized,
      negotiatedProtocolVersion: session.protocolVersion,
      hasSessionId: session.sessionId !== null,
      handshakeDurationMs,
      handshakeError,
    },
    toolDiscovery: {
      totalToolsCount: 0,
      pagesFetched: 0,
      targetToolPresence: {},
      tools: [],
    },
    callContractAnalysis: {
      detectedCategory: 'UNKNOWN',
      summary: 'Handshake incomplete or tools/list failed',
    },
    testCalls: [],
  };

  if (!initialized) {
    return report;
  }

  // MCP Tool Discovery: tools/list with bounded pagination
  let cursor: string | undefined = undefined;
  let nextId = 200;
  const tools: McpToolSummary[] = [];
  let pagesFetched = 0;
  const MAX_PAGES = 10;

  while (pagesFetched < MAX_PAGES) {
    pagesFetched++;
    const params: Record<string, unknown> = cursor ? { cursor } : {};
    const listRes = await sendMcpPost(
      BITGET_MCP_ENDPOINT,
      'tools/list',
      params,
      nextId++,
      session,
      fetchImpl,
      15_000
    );

    if (!listRes.envelope || listRes.envelope.error) {
      break;
    }

    const toolList = Array.isArray(listRes.envelope.result?.tools)
      ? listRes.envelope.result.tools
      : [];

    for (const item of toolList) {
      if (item && typeof item.name === 'string') {
        tools.push({
          name: item.name,
          description:
            typeof item.description === 'string' ? item.description : '',
          inputSchema:
            item.inputSchema && typeof item.inputSchema === 'object'
              ? (item.inputSchema as Record<string, unknown>)
              : {},
        });
      }
    }

    const nextCursor = listRes.envelope.result?.nextCursor;
    if (typeof nextCursor === 'string' && nextCursor.trim().length > 0) {
      cursor = nextCursor.trim();
    } else {
      break;
    }
  }

  const targetToolPresence: Record<string, boolean> = {};
  for (const name of TARGET_TOOL_NAMES) {
    targetToolPresence[name] = tools.some((t) => t.name === name);
  }

  report.toolDiscovery = {
    totalToolsCount: tools.length,
    pagesFetched,
    targetToolPresence,
    tools,
  };

  // Inspect do_query if present for comparison
  let doQueryComparison: DoQueryComparison | undefined;
  const doQueryTool = tools.find((t) => t.name === 'do_query');
  if (doQueryTool) {
    const inputSchema = doQueryTool.inputSchema;
    const properties =
      inputSchema.properties && typeof inputSchema.properties === 'object'
        ? (inputSchema.properties as Record<string, unknown>)
        : {};
    const serverProperties = Object.keys(properties);
    const serverRequired = Array.isArray(inputSchema.required)
      ? (inputSchema.required as string[])
      : [];
    const dissentExpected = ['entry_id', 'params'];

    const missingFromSchema = dissentExpected.filter(
      (f) => !serverProperties.includes(f)
    );
    const extraInSchema = serverProperties.filter(
      (f) => !dissentExpected.includes(f)
    );

    const propertyTypes: Record<string, string> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v && typeof v === 'object' && 'type' in v) {
        propertyTypes[k] = String((v as any).type);
      } else {
        propertyTypes[k] = typeof v;
      }
    }

    doQueryComparison = {
      isExposed: true,
      dissentExpectedFields: dissentExpected,
      serverProperties,
      serverRequired,
      missingFromSchema,
      extraInSchema,
      propertyTypes,
    };
  }

  // PHASE 2 & 3: DETERMINE CALL CONTRACT AND EXECUTE SAFE TESTS
  const hasDirectTools =
    targetToolPresence['equity_price_quote'] ||
    targetToolPresence['equity_fundamental_ratios'];
  const hasDiscoveryWrapper =
    targetToolPresence['search_tools'] ||
    targetToolPresence['available_tools'] ||
    targetToolPresence['call_tool'];
  const hasDoQuery = targetToolPresence['do_query'];

  if (hasDirectTools) {
    report.callContractAnalysis = {
      detectedCategory: 'DIRECT_TOOLS',
      summary:
        'Server exposes equity_price_quote and/or equity_fundamental_ratios directly in tool catalog. Testing direct tools/call.',
      doQueryComparison,
    };

    // Test direct equity_price_quote
    const quoteTool = tools.find((t) => t.name === 'equity_price_quote');
    if (quoteTool) {
      const args = constructDirectToolArgs(quoteTool.inputSchema, 'NVDA');
      const callRes = await sendMcpPost(
        BITGET_MCP_ENDPOINT,
        'tools/call',
        { name: 'equity_price_quote', arguments: args },
        nextId++,
        session,
        fetchImpl,
        15_000
      );
      report.testCalls.push(
        extractSafeReport(
          'equity_price_quote',
          args,
          callRes.status,
          callRes.envelope
        )
      );
    }

    // Test direct equity_fundamental_ratios
    const ratiosTool = tools.find(
      (t) => t.name === 'equity_fundamental_ratios'
    );
    if (ratiosTool) {
      const args = constructDirectToolArgs(ratiosTool.inputSchema, 'NVDA');
      const callRes = await sendMcpPost(
        BITGET_MCP_ENDPOINT,
        'tools/call',
        { name: 'equity_fundamental_ratios', arguments: args },
        nextId++,
        session,
        fetchImpl,
        15_000
      );
      report.testCalls.push(
        extractSafeReport(
          'equity_fundamental_ratios',
          args,
          callRes.status,
          callRes.envelope
        )
      );
    }
  } else if (hasDiscoveryWrapper) {
    report.callContractAnalysis = {
      detectedCategory: 'DISCOVERY_WRAPPER',
      summary:
        'Server exposes tool discovery wrappers (call_tool, search_tools, or available_tools).',
      doQueryComparison,
    };

    if (targetToolPresence['search_tools']) {
      const searchTool = tools.find((t) => t.name === 'search_tools');
      const args = searchTool
        ? constructDirectToolArgs(searchTool.inputSchema, 'equity')
        : { query: 'equity' };
      const callRes = await sendMcpPost(
        BITGET_MCP_ENDPOINT,
        'tools/call',
        { name: 'search_tools', arguments: args },
        nextId++,
        session,
        fetchImpl,
        15_000
      );
      report.testCalls.push(
        extractSafeReport(
          'search_tools',
          args,
          callRes.status,
          callRes.envelope
        )
      );
    } else if (targetToolPresence['available_tools']) {
      const args = {};
      const callRes = await sendMcpPost(
        BITGET_MCP_ENDPOINT,
        'tools/call',
        { name: 'available_tools', arguments: args },
        nextId++,
        session,
        fetchImpl,
        15_000
      );
      report.testCalls.push(
        extractSafeReport(
          'available_tools',
          args,
          callRes.status,
          callRes.envelope
        )
      );
    }
  } else if (hasDoQuery) {
    report.callContractAnalysis = {
      detectedCategory: 'DO_QUERY',
      summary:
        'Server exposes only do_query dispatcher. Inspecting inputSchema drift.',
      doQueryComparison,
    };

    // Test invoking do_query with NVDA
    const args = {
      entry_id: 'equity_price_quote',
      params: { symbol: 'NVDA' },
    };
    const callRes = await sendMcpPost(
      BITGET_MCP_ENDPOINT,
      'tools/call',
      { name: 'do_query', arguments: args },
      nextId++,
      session,
      fetchImpl,
      15_000
    );
    report.testCalls.push(
      extractSafeReport('do_query', args, callRes.status, callRes.envelope)
    );
  } else {
    report.callContractAnalysis = {
      detectedCategory: 'UNKNOWN',
      summary:
        'Neither direct equity tools nor do_query dispatcher were found in tool catalog.',
      doQueryComparison,
    };
  }

  return report;
}

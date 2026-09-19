# Frontend API Integration

The Phase 4 backend is a synchronous, same-origin Next.js API. The browser owns persistence for this anonymous MVP; the server stores no runs, briefs, or decisions.

## Research

`POST /api/research`

```json
{ "thesis": "I think ETH will outperform BTC over the next 48 hours because ..." }
```

- `thesis` is preserved verbatim, must contain at least three non-whitespace characters, and is limited to 2,000 characters.
- The only supported V1 market is a relative ETH/BTC thesis.
- Clients cannot provide IDs, timestamps, model names, token budgets, provider keys, or tools.
- The request remains open while the real pipeline runs. The UI may display a local `PENDING` state while `fetch` is pending. The API returns only `COMPLETED` or `FAILED`; it does not expose fake percentages or intermediate thinking.

Successful response (`200`):

```ts
{
  ok: true;
  state: 'COMPLETED';
  runId: string;
  brief: DissentBriefV1;       // humanDecision is null
  advocateCase: ArgumentV1;    // stance is ADVOCATE
  timingsMs: {
    structuring: number;
    marketResearch: number;
    argumentation: number;
    stressTesting: number;
    synthesis: number;
    total: number;
  };
  persistence: {
    strategy: 'BROWSER_LOCAL';
    serverStored: false;
    crossDeviceRecovery: false;
  };
}
```

Failed response (`4xx` or `5xx`):

```ts
{
  ok: false;
  state: 'FAILED';
  requestId: string;
  error: {
    code: 'INVALID_INPUT' | 'CONFIGURATION_ERROR' | 'UNSUPPORTED_MARKET' |
      'EVIDENCE_UNAVAILABLE' | 'EVIDENCE_STALE' | 'EXTERNAL_PROVIDER_ERROR' |
      'MODEL_OUTPUT_INVALID' | 'OUTPUT_TRUNCATED' | 'ANALYSIS_FAILED' | 'TIMEOUT';
    message: string;     // sanitized; no provider response or secret
    retryable: boolean;
  };
}
```

## Human decision

`POST /api/decisions`

```json
{
  "runId": "run_...",
  "thesisId": "th_...",
  "decision": "WATCH",
  "notes": "Optional, maximum 1000 characters",
  "clientSessionId": "optional-local-session-id",
  "confirmedByUser": true
}
```

`decision` accepts only `PROCEED`, `WATCH`, or `PASS`. The server owns the decision ID, timestamp, `actorType`, and attribution metadata. For the anonymous MVP, attribution proves only that the decision arrived through the explicit human-action endpoint; `identityVerified` is `false`. No decision triggers trade execution.

The successful response contains `HumanDecisionV1` and the same browser-local persistence descriptor. Store it with the brief locally and attach it only when `runId` and `thesisId` match. There is no server recovery endpoint, cross-browser recovery, or cross-device recovery.

## Deployment requirements

- Node.js runtime; `/api/research` exports `maxDuration = 120`.
- Keep Vercel Fluid Compute enabled. Its [documented function limits](https://vercel.com/docs/functions/limitations) give Hobby a 300-second default/maximum; legacy non-Fluid Hobby is limited to 60 seconds and is not a safe target for the observed baseline plus provider variance. App Router supports the route-level `maxDuration` used here through Vercel's [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).
- Set `RESEARCH_API_ENABLED=true` only after configuring [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) for `/api/research`. Recommended initial rule: fixed window, per-IP, three requests per ten minutes, returning `429`; monitor legitimate shared-network traffic and adjust deliberately.
- The application deliberately has no process-local rate limiter because it would not be globally reliable across Vercel instances.
- Both endpoints require JSON, cap bodies at 8 KiB, reject cross-site browser requests, return `Cache-Control: no-store`, and never accept browser-supplied credentials.

Live local proof:

```bash
DEEPSEEK_API_KEY=... npm run test:integration:api
```

import { runBitgetToolProbe } from '@/server/diag/bitget-tool-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  // Preview-only: refuse execution on production Vercel environment
  if (process.env.VERCEL_ENV === 'production') {
    return new Response(
      JSON.stringify({
        error:
          'Diagnostic probe is disabled in production environment (VERCEL_ENV=production)',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  try {
    const report = await runBitgetToolProbe();
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        error: 'Diagnostic probe execution failed',
        message: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}

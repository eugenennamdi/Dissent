import { handleHumanDecisionPost } from '@/server/application/human-decision-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  return handleHumanDecisionPost(request);
}

export const SUPPORTED_RESEARCH_ASSETS = ['BTC', 'ETH', 'SOL'] as const;
export type SupportedResearchAsset = (typeof SUPPORTED_RESEARCH_ASSETS)[number];

export const RESEARCH_QUOTE_ASSET = 'USDT' as const;

export const SUPPORTED_THESIS_DIRECTIONS = [
  'LONG',
  'SHORT',
  'RELATIVE_LONG',
  'RELATIVE_SHORT',
] as const;
export type SupportedThesisDirection = (typeof SUPPORTED_THESIS_DIRECTIONS)[number];

export type SupportedThesisKind = 'RELATIVE' | 'SINGLE_ASSET';

export interface SupportedThesisMarket {
  market: string;
  baseAsset: SupportedResearchAsset;
  quoteAsset: SupportedResearchAsset | typeof RESEARCH_QUOTE_ASSET;
  kind: SupportedThesisKind;
  directions: readonly SupportedThesisDirection[];
}

const relativeMarkets = SUPPORTED_RESEARCH_ASSETS.flatMap((baseAsset) =>
  SUPPORTED_RESEARCH_ASSETS.filter((quoteAsset) => quoteAsset !== baseAsset).map(
    (quoteAsset): SupportedThesisMarket => ({
      market: `${baseAsset}/${quoteAsset}`,
      baseAsset,
      quoteAsset,
      kind: 'RELATIVE',
      directions: ['RELATIVE_LONG', 'RELATIVE_SHORT'],
    })
  )
);

const singleAssetMarkets = SUPPORTED_RESEARCH_ASSETS.map(
  (baseAsset): SupportedThesisMarket => ({
    market: `${baseAsset}/${RESEARCH_QUOTE_ASSET}`,
    baseAsset,
    quoteAsset: RESEARCH_QUOTE_ASSET,
    kind: 'SINGLE_ASSET',
    directions: ['LONG', 'SHORT'],
  })
);

export const SUPPORTED_THESIS_MARKETS: readonly SupportedThesisMarket[] = [
  ...relativeMarkets,
  ...singleAssetMarkets,
];

export const SUPPORTED_MARKET_NAMES = SUPPORTED_THESIS_MARKETS.map(
  (definition) => definition.market
);

export const SUPPORTED_BASE_ASSETS = SUPPORTED_RESEARCH_ASSETS;
export const SUPPORTED_QUOTE_ASSETS = [
  ...SUPPORTED_RESEARCH_ASSETS,
  RESEARCH_QUOTE_ASSET,
] as const;

export function resolveSupportedThesisMarket(input: {
  market: string;
  baseAsset: string;
  quoteAsset: string;
  direction: string;
}): SupportedThesisMarket | undefined {
  const market = input.market.trim().toUpperCase();
  const baseAsset = input.baseAsset.trim().toUpperCase();
  const quoteAsset = input.quoteAsset.trim().toUpperCase();
  const direction = input.direction.trim().toUpperCase();
  if (
    input.market !== market ||
    input.baseAsset !== baseAsset ||
    input.quoteAsset !== quoteAsset ||
    input.direction !== direction
  ) {
    return undefined;
  }
  return SUPPORTED_THESIS_MARKETS.find(
    (definition) =>
      definition.market === market &&
      definition.baseAsset === baseAsset &&
      definition.quoteAsset === quoteAsset &&
      definition.directions.includes(direction as SupportedThesisDirection)
  );
}

export function isRelativeThesisMarket(
  definition: SupportedThesisMarket
): boolean {
  return definition.kind === 'RELATIVE';
}

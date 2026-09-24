export const SUPPORTED_CRYPTO_ASSETS = ['BTC', 'ETH', 'SOL'] as const;
export type SupportedCryptoAsset = (typeof SUPPORTED_CRYPTO_ASSETS)[number];

export const SUPPORTED_EQUITY_ASSETS = ['NVDA'] as const;
export type SupportedEquityAsset = (typeof SUPPORTED_EQUITY_ASSETS)[number];

export const SUPPORTED_RESEARCH_ASSETS = [
  ...SUPPORTED_CRYPTO_ASSETS,
  ...SUPPORTED_EQUITY_ASSETS,
] as const;
export type SupportedResearchAsset = (typeof SUPPORTED_RESEARCH_ASSETS)[number];

export const RESEARCH_QUOTE_ASSET = 'USDT' as const;
export const EQUITY_QUOTE_ASSET = 'USD' as const;

export const SUPPORTED_THESIS_DIRECTIONS = [
  'LONG',
  'SHORT',
  'RELATIVE_LONG',
  'RELATIVE_SHORT',
] as const;
export type SupportedThesisDirection = (typeof SUPPORTED_THESIS_DIRECTIONS)[number];

export type SupportedThesisKind = 'RELATIVE' | 'SINGLE_ASSET';
export type SupportedAssetClass = 'CRYPTO' | 'EQUITY';

export interface SupportedThesisMarket {
  market: string;
  baseAsset: SupportedResearchAsset;
  quoteAsset:
    | SupportedCryptoAsset
    | typeof RESEARCH_QUOTE_ASSET
    | typeof EQUITY_QUOTE_ASSET;
  kind: SupportedThesisKind;
  directions: readonly SupportedThesisDirection[];
  assetClass: SupportedAssetClass;
}

const relativeCryptoMarkets = SUPPORTED_CRYPTO_ASSETS.flatMap((baseAsset) =>
  SUPPORTED_CRYPTO_ASSETS.filter((quoteAsset) => quoteAsset !== baseAsset).map(
    (quoteAsset): SupportedThesisMarket => ({
      market: `${baseAsset}/${quoteAsset}`,
      baseAsset,
      quoteAsset,
      kind: 'RELATIVE',
      directions: ['RELATIVE_LONG', 'RELATIVE_SHORT'],
      assetClass: 'CRYPTO',
    })
  )
);

const singleAssetCryptoMarkets = SUPPORTED_CRYPTO_ASSETS.map(
  (baseAsset): SupportedThesisMarket => ({
    market: `${baseAsset}/${RESEARCH_QUOTE_ASSET}`,
    baseAsset,
    quoteAsset: RESEARCH_QUOTE_ASSET,
    kind: 'SINGLE_ASSET',
    directions: ['LONG', 'SHORT'],
    assetClass: 'CRYPTO',
  })
);

const singleAssetEquityMarkets = SUPPORTED_EQUITY_ASSETS.map(
  (baseAsset): SupportedThesisMarket => ({
    market: `${baseAsset}/${EQUITY_QUOTE_ASSET}`,
    baseAsset,
    quoteAsset: EQUITY_QUOTE_ASSET,
    kind: 'SINGLE_ASSET',
    directions: ['LONG', 'SHORT'],
    assetClass: 'EQUITY',
  })
);

export const SUPPORTED_THESIS_MARKETS: readonly SupportedThesisMarket[] = [
  ...relativeCryptoMarkets,
  ...singleAssetCryptoMarkets,
  ...singleAssetEquityMarkets,
];

export const SUPPORTED_MARKET_NAMES = SUPPORTED_THESIS_MARKETS.map(
  (definition) => definition.market
);

export const SUPPORTED_BASE_ASSETS = SUPPORTED_RESEARCH_ASSETS;
export const SUPPORTED_QUOTE_ASSETS = [
  ...SUPPORTED_CRYPTO_ASSETS,
  RESEARCH_QUOTE_ASSET,
  EQUITY_QUOTE_ASSET,
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

export function isEquityThesisMarket(
  input: SupportedThesisMarket | string
): boolean {
  if (typeof input === 'string') {
    return SUPPORTED_THESIS_MARKETS.some(
      (def) => def.market === input.trim().toUpperCase() && def.assetClass === 'EQUITY'
    );
  }
  return input.assetClass === 'EQUITY';
}

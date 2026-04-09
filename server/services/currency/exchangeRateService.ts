/**
 * Real-Time Exchange Rate Service
 * Fortune 500-Grade Multi-Currency Support
 * 
 * Features:
 * - Real-time exchange rate fetching from multiple providers
 * - Automatic fallback between providers
 * - Rate caching with configurable TTL
 * - Historical rate storage for audit trails
 * - Currency conversion with precision handling
 */

import { db } from '../../db';
import { exchangeRates } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { circuitBreaker } from '../infrastructure/circuitBreaker';
import { auditLogger } from '../audit-logger';
import { createLogger } from '../../lib/logger';
const log = createLogger('exchangeRateService');


interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: string;
  fetchedAt: Date;
  validUntil: Date;
}

interface ConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  rate: number;
  rateSource: string;
  rateTimestamp: Date;
}

type RateProvider = 'openexchangerates' | 'exchangeratesapi' | 'fallback';

const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN',
  'BRL', 'KRW', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'NZD', 'ZAR', 'RUB'
];

const FALLBACK_RATES: Record<string, number> = {
  'EUR': 0.92,
  'GBP': 0.79,
  'CAD': 1.36,
  'AUD': 1.53,
  'JPY': 149.50,
  'CHF': 0.88,
  'CNY': 7.24,
  'INR': 83.12,
  'MXN': 17.15,
};

class ExchangeRateService {
  private rateCache: Map<string, ExchangeRate> = new Map();
  private readonly cacheTTLMs = 60 * 60 * 1000;
  private readonly baseCurrency = 'USD';

  constructor() {
    this.initializeCircuitBreaker();
    log.info('[ExchangeRate] Service initialized with', SUPPORTED_CURRENCIES.length, 'currencies');
  }

  private initializeCircuitBreaker(): void {
    circuitBreaker.registerCircuit('exchangeRate', 'Exchange Rate Service', {
      failureThreshold: 3,
      timeout: 300000,
      successThreshold: 1,
    });
  }

  private getCacheKey(from: string, to: string): string {
    return `${from.toUpperCase()}-${to.toUpperCase()}`;
  }

  async getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: 1,
        source: 'identity',
        fetchedAt: new Date(),
        validUntil: new Date(Date.now() + this.cacheTTLMs),
      };
    }

    const cacheKey = this.getCacheKey(from, to);
    const cached = this.rateCache.get(cacheKey);
    
    if (cached && cached.validUntil > new Date()) {
      return cached;
    }

    const dbRate = await this.getRateFromDatabase(from, to);
    if (dbRate) {
      this.rateCache.set(cacheKey, dbRate);
      return dbRate;
    }

    const freshRate = await this.fetchFreshRate(from, to);
    this.rateCache.set(cacheKey, freshRate);
    await this.storeRate(freshRate);
    
    return freshRate;
  }

  private async getRateFromDatabase(from: string, to: string): Promise<ExchangeRate | null> {
    try {
      const cutoff = new Date(Date.now() - this.cacheTTLMs);
      
      const [rate] = await db.select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.fromCurrency, from),
            eq(exchangeRates.toCurrency, to),
            gte(exchangeRates.fetchedAt, cutoff)
          )
        )
        .orderBy(desc(exchangeRates.fetchedAt))
        .limit(1);

      if (rate) {
        return {
          fromCurrency: (rate as any).fromCurrency,
          toCurrency: (rate as any).toCurrency,
          rate: parseFloat(rate.rate),
          source: rate.source,
          fetchedAt: rate.fetchedAt,
          validUntil: new Date(rate.fetchedAt.getTime() + this.cacheTTLMs),
        };
      }
      
      return null;
    } catch (error) {
      log.error('[ExchangeRate] Database fetch error:', error);
      return null;
    }
  }

  private async fetchFreshRate(from: string, to: string): Promise<ExchangeRate> {
    const providers: RateProvider[] = ['openexchangerates', 'exchangeratesapi', 'fallback'];
    
    for (const provider of providers) {
      try {
        const rate = await this.fetchFromProvider(provider, from, to);
        if (rate) {
          log.info(`[ExchangeRate] Fetched ${from}/${to} = ${rate.rate} from ${provider}`);
          return rate;
        }
      } catch (error) {
        log.warn(`[ExchangeRate] Provider ${provider} failed:`, (error as Error).message);
      }
    }

    return this.getFallbackRate(from, to);
  }

  private async fetchFromProvider(
    provider: RateProvider,
    from: string,
    to: string
  ): Promise<ExchangeRate | null> {
    if (provider === 'fallback') {
      return this.getFallbackRate(from, to);
    }

    const result = await circuitBreaker.execute(
      'exchangeRate',
      async () => {
        if (provider === 'openexchangerates') {
          return this.fetchFromOpenExchangeRates(from, to);
        } else if (provider === 'exchangeratesapi') {
          return this.fetchFromExchangeRatesAPI(from, to);
        }
        return null;
      },
      async () => this.getFallbackRate(from, to)
    );

    return result.data ?? this.getFallbackRate(from, to);
  }

  private async fetchFromOpenExchangeRates(from: string, to: string): Promise<ExchangeRate | null> {
    const apiKey = process.env.OPENEXCHANGERATES_API_KEY;
    if (!apiKey) return null;

    const response = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&base=USD&symbols=${from},${to}`
    );

    if (!response.ok) {
      throw new Error(`OpenExchangeRates API error: ${response.status}`);
    }

    const data = await response.json();
    
    let rate: number;
    if (from === 'USD') {
      rate = data.rates[to];
    } else if (to === 'USD') {
      rate = 1 / data.rates[from];
    } else {
      rate = data.rates[to] / data.rates[from];
    }

    return {
      fromCurrency: from,
      toCurrency: to,
      rate,
      source: 'openexchangerates',
      fetchedAt: new Date(),
      validUntil: new Date(Date.now() + this.cacheTTLMs),
    };
  }

  private async fetchFromExchangeRatesAPI(from: string, to: string): Promise<ExchangeRate | null> {
    const apiKey = process.env.EXCHANGERATESAPI_KEY;
    if (!apiKey) return null;

    const response = await fetch(
      `https://api.exchangeratesapi.io/v1/latest?access_key=${apiKey}&base=${from}&symbols=${to}`
    );

    if (!response.ok) {
      throw new Error(`ExchangeRatesAPI error: ${response.status}`);
    }

    const data = await response.json();

    return {
      fromCurrency: from,
      toCurrency: to,
      rate: data.rates[to],
      source: 'exchangeratesapi',
      fetchedAt: new Date(),
      validUntil: new Date(Date.now() + this.cacheTTLMs),
    };
  }

  private getFallbackRate(from: string, to: string): ExchangeRate {
    let rate: number;

    if (from === 'USD') {
      rate = FALLBACK_RATES[to] || 1;
    } else if (to === 'USD') {
      rate = 1 / (FALLBACK_RATES[from] || 1);
    } else {
      const fromToUSD = 1 / (FALLBACK_RATES[from] || 1);
      const usdToTarget = FALLBACK_RATES[to] || 1;
      rate = fromToUSD * usdToTarget;
    }

    log.warn(`[ExchangeRate] Using fallback rate for ${from}/${to}: ${rate}`);

    return {
      fromCurrency: from,
      toCurrency: to,
      rate,
      source: 'fallback',
      fetchedAt: new Date(),
      validUntil: new Date(Date.now() + this.cacheTTLMs),
    };
  }

  private async storeRate(rate: ExchangeRate): Promise<void> {
    try {
      await db.insert(exchangeRates).values({
        baseCurrency: rate.fromCurrency,
        targetCurrency: rate.toCurrency,
        rate: rate.rate.toString(),
        source: rate.source,
        rateDate: rate.fetchedAt,
        fetchedAt: rate.fetchedAt,
      }).onConflictDoNothing();
    } catch (error) {
      log.error('[ExchangeRate] Error storing rate:', error);
    }
  }

  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    options?: { precision?: number }
  ): Promise<ConversionResult> {
    const rate = await this.getRate(fromCurrency, toCurrency);
    const precision = options?.precision ?? 2;
    
    const convertedAmount = Number((amount * rate.rate).toFixed(precision));

    await auditLogger.logSystemAction({
      actionType: 'CURRENCY_CONVERSION',
      targetEntityType: 'EXCHANGE_RATE',
      targetEntityId: `${fromCurrency}-${toCurrency}`,
      payload: {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount,
        targetCurrency: toCurrency,
        rate: rate.rate,
        source: rate.source,
      },
    });

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount,
      targetCurrency: toCurrency,
      rate: rate.rate,
      rateSource: rate.source,
      rateTimestamp: rate.fetchedAt,
    };
  }

  async refreshAllRates(): Promise<{ updated: number; failed: string[] }> {
    const failed: string[] = [];
    let updated = 0;

    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === this.baseCurrency) continue;

      try {
        await this.getRate(this.baseCurrency, currency);
        updated++;
      } catch (error) {
        failed.push(currency);
      }
    }

    log.info(`[ExchangeRate] Refresh complete: ${updated} updated, ${failed.length} failed`);
    return { updated, failed };
  }

  getSupportedCurrencies(): string[] {
    return [...SUPPORTED_CURRENCIES];
  }

  getCacheStats(): { size: number; currencies: string[] } {
    return {
      size: this.rateCache.size,
      currencies: Array.from(this.rateCache.keys()),
    };
  }
}

export const exchangeRateService = new ExchangeRateService();

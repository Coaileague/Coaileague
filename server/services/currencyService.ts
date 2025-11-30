import { db } from '../db';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import {
  exchangeRates,
  workspaceCurrencySettings,
  currencyConversionLog,
  InsertExchangeRate,
  InsertWorkspaceCurrencySettings,
} from '@shared/schema';

const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN',
  'BRL', 'NZD', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'KRW'
] as const;

type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', JPY: '¥',
  CHF: 'CHF', CNY: '¥', INR: '₹', MXN: 'Mex$', BRL: 'R$', NZD: 'NZ$',
  SGD: 'S$', HKD: 'HK$', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł',
  ZAR: 'R', KRW: '₩'
};

const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.53, JPY: 154.50, CHF: 0.88,
  CNY: 7.24, INR: 84.10, MXN: 17.35, BRL: 5.01, NZD: 1.67, SGD: 1.34,
  HKD: 7.82, SEK: 10.48, NOK: 10.79, DKK: 6.87, PLN: 3.98, ZAR: 18.23,
  KRW: 1377.50
};

export class CurrencyService {
  async getExchangeRate(
    baseCurrency: string,
    targetCurrency: string,
    rateDate?: Date
  ): Promise<number> {
    try {
      if (baseCurrency === targetCurrency) return 1;
      
      const dateToUse = rateDate || new Date();
      const startOfDay = new Date(dateToUse);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateToUse);
      endOfDay.setHours(23, 59, 59, 999);
      
      const [rate] = await db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
            eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase()),
            gte(exchangeRates.rateDate, startOfDay),
            lte(exchangeRates.rateDate, endOfDay),
            eq(exchangeRates.isActive, true)
          )
        )
        .orderBy(desc(exchangeRates.fetchedAt))
        .limit(1);
      
      if (rate) {
        return parseFloat(rate.rate);
      }
      
      const [latestRate] = await db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
            eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase()),
            eq(exchangeRates.isActive, true)
          )
        )
        .orderBy(desc(exchangeRates.rateDate))
        .limit(1);
      
      if (latestRate) {
        return parseFloat(latestRate.rate);
      }
      
      if (baseCurrency.toUpperCase() === 'USD' && DEFAULT_EXCHANGE_RATES[targetCurrency.toUpperCase()]) {
        return DEFAULT_EXCHANGE_RATES[targetCurrency.toUpperCase()];
      }
      
      if (targetCurrency.toUpperCase() === 'USD' && DEFAULT_EXCHANGE_RATES[baseCurrency.toUpperCase()]) {
        return 1 / DEFAULT_EXCHANGE_RATES[baseCurrency.toUpperCase()];
      }
      
      console.warn(`[CurrencyService] No exchange rate found for ${baseCurrency} -> ${targetCurrency}, using 1`);
      return 1;
    } catch (error) {
      console.error('[CurrencyService] Error getting exchange rate:', error);
      return 1;
    }
  }
  
  async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    workspaceId?: string,
    options?: {
      rateDate?: Date;
      logConversion?: boolean;
      referenceType?: string;
      referenceId?: string;
    }
  ): Promise<{
    convertedAmount: number;
    exchangeRate: number;
    rateDate: Date;
  }> {
    try {
      if (fromCurrency === toCurrency) {
        return { convertedAmount: amount, exchangeRate: 1, rateDate: new Date() };
      }
      
      const rateDate = options?.rateDate || new Date();
      const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency, rateDate);
      const convertedAmount = Math.round((amount * exchangeRate) * 10000) / 10000;
      
      if (options?.logConversion && workspaceId) {
        await db.insert(currencyConversionLog).values({
          workspaceId,
          sourceAmount: amount.toFixed(4),
          sourceCurrency: fromCurrency.toUpperCase(),
          targetAmount: convertedAmount.toFixed(4),
          targetCurrency: toCurrency.toUpperCase(),
          exchangeRate: exchangeRate.toFixed(8),
          rateSource: 'system',
          rateDate,
          referenceType: options.referenceType,
          referenceId: options.referenceId,
        });
      }
      
      return { convertedAmount, exchangeRate, rateDate };
    } catch (error) {
      console.error('[CurrencyService] Error converting amount:', error);
      return { convertedAmount: amount, exchangeRate: 1, rateDate: new Date() };
    }
  }
  
  async setExchangeRate(
    baseCurrency: string,
    targetCurrency: string,
    rate: number,
    source: 'system' | 'api' | 'manual' = 'system'
  ): Promise<void> {
    try {
      await db.update(exchangeRates)
        .set({ isActive: false })
        .where(
          and(
            eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
            eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase())
          )
        );
      
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      await db.insert(exchangeRates).values({
        baseCurrency: baseCurrency.toUpperCase(),
        targetCurrency: targetCurrency.toUpperCase(),
        rate: rate.toFixed(8),
        inverseRate: (1 / rate).toFixed(8),
        source,
        rateDate: now,
        expiresAt,
        isActive: true,
      });
      
      console.log(`[CurrencyService] Set exchange rate: 1 ${baseCurrency} = ${rate} ${targetCurrency}`);
    } catch (error) {
      console.error('[CurrencyService] Error setting exchange rate:', error);
      throw error;
    }
  }
  
  async seedDefaultRates(): Promise<void> {
    try {
      console.log('[CurrencyService] Seeding default exchange rates...');
      
      for (const [currency, rate] of Object.entries(DEFAULT_EXCHANGE_RATES)) {
        await this.setExchangeRate('USD', currency, rate, 'system');
      }
      
      console.log('[CurrencyService] Default exchange rates seeded successfully');
    } catch (error) {
      console.error('[CurrencyService] Error seeding default rates:', error);
    }
  }
  
  async getWorkspaceCurrencySettings(workspaceId: string): Promise<{
    primaryCurrency: string;
    supportedCurrencies: string[];
    currencyDisplayFormat: string;
    decimalPlaces: number;
    autoConvertToBase: boolean;
    exchangeRateMarginPercent: number;
  }> {
    try {
      const [settings] = await db
        .select()
        .from(workspaceCurrencySettings)
        .where(eq(workspaceCurrencySettings.workspaceId, workspaceId));
      
      if (settings) {
        return {
          primaryCurrency: settings.primaryCurrency,
          supportedCurrencies: settings.supportedCurrencies || ['USD'],
          currencyDisplayFormat: settings.currencyDisplayFormat || 'symbol',
          decimalPlaces: settings.decimalPlaces || 2,
          autoConvertToBase: settings.autoConvertToBase ?? true,
          exchangeRateMarginPercent: parseFloat(settings.exchangeRateMarginPercent || '0'),
        };
      }
      
      return {
        primaryCurrency: 'USD',
        supportedCurrencies: ['USD'],
        currencyDisplayFormat: 'symbol',
        decimalPlaces: 2,
        autoConvertToBase: true,
        exchangeRateMarginPercent: 0,
      };
    } catch (error) {
      console.error('[CurrencyService] Error getting workspace currency settings:', error);
      return {
        primaryCurrency: 'USD',
        supportedCurrencies: ['USD'],
        currencyDisplayFormat: 'symbol',
        decimalPlaces: 2,
        autoConvertToBase: true,
        exchangeRateMarginPercent: 0,
      };
    }
  }
  
  async updateWorkspaceCurrencySettings(
    workspaceId: string,
    settings: Partial<InsertWorkspaceCurrencySettings>
  ): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(workspaceCurrencySettings)
        .where(eq(workspaceCurrencySettings.workspaceId, workspaceId));
      
      if (existing.length > 0) {
        await db.update(workspaceCurrencySettings)
          .set({ ...settings, updatedAt: new Date() })
          .where(eq(workspaceCurrencySettings.workspaceId, workspaceId));
      } else {
        await db.insert(workspaceCurrencySettings).values({
          workspaceId,
          ...settings,
        });
      }
      
      console.log(`[CurrencyService] Updated currency settings for workspace ${workspaceId}`);
    } catch (error) {
      console.error('[CurrencyService] Error updating workspace currency settings:', error);
      throw error;
    }
  }
  
  formatCurrency(
    amount: number,
    currency: string,
    format: 'symbol' | 'code' | 'both' = 'symbol',
    decimalPlaces: number = 2
  ): string {
    const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency;
    const formattedAmount = amount.toFixed(decimalPlaces);
    
    switch (format) {
      case 'symbol':
        return `${symbol}${formattedAmount}`;
      case 'code':
        return `${formattedAmount} ${currency.toUpperCase()}`;
      case 'both':
        return `${symbol}${formattedAmount} ${currency.toUpperCase()}`;
      default:
        return `${symbol}${formattedAmount}`;
    }
  }
  
  getSupportedCurrencies(): { code: string; symbol: string }[] {
    return SUPPORTED_CURRENCIES.map(code => ({
      code,
      symbol: CURRENCY_SYMBOLS[code] || code,
    }));
  }
  
  async getConversionHistory(
    workspaceId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      referenceType?: string;
      limit?: number;
    }
  ): Promise<Array<{
    id: string;
    sourceAmount: string;
    sourceCurrency: string;
    targetAmount: string;
    targetCurrency: string;
    exchangeRate: string;
    rateDate: Date | null;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: Date | null;
  }>> {
    try {
      const conditions = [eq(currencyConversionLog.workspaceId, workspaceId)];
      
      if (options?.startDate) {
        conditions.push(gte(currencyConversionLog.createdAt, options.startDate));
      }
      if (options?.endDate) {
        conditions.push(lte(currencyConversionLog.createdAt, options.endDate));
      }
      if (options?.referenceType) {
        conditions.push(eq(currencyConversionLog.referenceType, options.referenceType));
      }
      
      const history = await db
        .select()
        .from(currencyConversionLog)
        .where(and(...conditions))
        .orderBy(desc(currencyConversionLog.createdAt))
        .limit(options?.limit || 100);
      
      return history;
    } catch (error) {
      console.error('[CurrencyService] Error getting conversion history:', error);
      return [];
    }
  }
}

export const currencyService = new CurrencyService();

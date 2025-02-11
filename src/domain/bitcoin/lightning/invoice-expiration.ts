import { SECS_PER_2_MINS, SECS_PER_DAY } from "@config/app"

const DEFAULT_EXPIRATIONS = {
  BTC: { delay: SECS_PER_DAY },
  USD: { delay: SECS_PER_2_MINS },
}

export const invoiceExpirationForCurrency = (
  currency: TxDenominationCurrency,
  now: Date,
): InvoiceExpiration => {
  const { delay } = DEFAULT_EXPIRATIONS[currency]
  const expirationTimestamp = now.getTime() + delay * 1000
  return new Date(expirationTimestamp) as InvoiceExpiration
}

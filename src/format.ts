const formats = new Map<string, Intl.NumberFormat>();

/**
 * An amount in euros as a price: `€ 12,50` for `nl-NL`. Amounts from the API are numbers with two
 * decimals, VAT included.
 */
export function formatPrice(amount: number | string, locale = "nl-NL"): string {
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    formats.set(locale, format);
  }
  return format.format(Number(amount));
}

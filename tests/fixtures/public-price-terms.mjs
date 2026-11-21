export const priceTerms=[1,2,3].map(property_id=>({property_id,credit_fee_bps:700,installments_count:10,cash_price_source:'quote',updated_at:'2026-11-21T12:00:00Z'}));
export function configurePrices(window){window.VillePrices.configure(priceTerms);}

export const formatMoney = (cents: unknown) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(Number(cents || 0) / 100);

export const formatDate = (value: unknown, includeTime = false) => {
  if (!value) return "";
  const text = String(value);
  // A lodging date is a calendar day, not midnight UTC (the previous day in Brazil).
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = new Date(dateOnly ? `${text}T12:00:00Z` : text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    ...(includeTime && !dateOnly ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

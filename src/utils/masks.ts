export const maskPhoneNumber = (value: string): string => {
    if (!value) return "";

    return value
      .replace(/\D/g, "")
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d)(\d{4})$/, "$1-$2")
      .substring(0, 15);
  };

/**
 * Normaliza um nome para "Title Case": primeira letra de cada palavra em
 * maiúsculo e o resto em minúsculo, independente de como foi digitado.
 * Ex: "joão silva" e "JOÃO SILVA" viram "João Silva".
 */
export const capitalizeName = (name: string): string => {
    return name
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

/** Valor em reais enquanto digita: "1200000" → "R$ 12.000,00" (os 2 últimos dígitos são centavos). */
export const maskCurrencyBRL = (value: string): string => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
  if (!digits) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(digits) / 100);
};

/** "00000000000100" → "00.000.000/0001-00". */
export const maskCnpj = (value: string): string =>
  value
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");

/** "00000000" → "00000-000". */
export const maskCep = (value: string): string =>
  value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");

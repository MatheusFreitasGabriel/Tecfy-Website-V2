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
import "server-only";
import { cache } from "react";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import type { AdminUserOption } from "./types";

/**
 * Usuários com acesso ao painel (claim `admin === true` no Firebase Auth).
 * Usado no select "Responsável pela captura" e para validar o `owner_uid` no servidor.
 * Memoizado por requisição.
 */
export const listAdminUsers = cache(async (): Promise<AdminUserOption[]> => {
  const admins: AdminUserOption[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAdminAuth().listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.disabled || user.customClaims?.admin !== true) continue;
      admins.push({ uid: user.uid, name: user.displayName?.trim() || user.email || "Sem nome" });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return admins.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});

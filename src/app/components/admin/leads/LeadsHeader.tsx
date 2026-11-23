"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FaFileImport, FaPlus } from "react-icons/fa6";
import type { AdminUserOption, LeadRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import CreateLeadModal from "./CreateLeadModal";

interface LeadsHeaderProps {
  total: number;
  basePath: string;
  admins: AdminUserOption[];
  currentUid: string;
  /** Lead recém-criado (a lista insere sem recarregar). */
  onCreated: (lead: LeadRow, contactReused: boolean) => void;
}

const integer = new Intl.NumberFormat("pt-BR");

/** Tira o atalho (?novo=1 / ?nova=1) da URL para não reabrir o modal ao recarregar. */
function clearShortcut(param: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return;
  url.searchParams.delete(param);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}


/** Topo da tela de Leads: título + total, descrição e as ações "Importar lista" / "Criar lead". */
export default function LeadsHeader({ total, basePath, admins, currentUid, onCreated }: LeadsHeaderProps) {
  // "+ Lead" do Dashboard chega com ?novo=1 e já abre o cadastro.
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(() => searchParams.get("novo") === "1");

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center gap-4">
          <h1 className="text-[32px] font-semibold leading-[38px] tracking-tight text-text-primary">Leads</h1>
          <span
            aria-label={`${integer.format(total)} leads`}
            className="flex h-7 min-w-[38px] items-center justify-center border border-border-secondary px-2.5 text-sm font-semibold leading-5 text-white/70"
          >
            {integer.format(total)}
          </span>
        </div>
        <p className="text-sm font-medium leading-5 text-admin-text-description">
          Gerencie e qualifique seus leads antes de enviá-los para negociação.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-4">
        <Link
          href={`${basePath}/leads/importar`}
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap border border-admin-button-border px-6 text-sm font-semibold leading-5 text-text-primary transition-colors hover:border-white/60 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <FaFileImport aria-hidden className="h-3.5 w-3.5" />
          Importar lista
        </Link>
        <Button icon={FaPlus} onClick={() => setCreating(true)}>
          Criar lead
        </Button>
      </div>

      {creating && (
        <CreateLeadModal
          basePath={basePath}
          admins={admins}
          currentUid={currentUid}
          onClose={() => {
            setCreating(false);
            clearShortcut("novo");
          }}
          onCreated={onCreated}
        />
      )}
    </header>
  );
}

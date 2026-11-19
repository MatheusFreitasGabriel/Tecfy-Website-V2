"use client";

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

/** Topo da tela de Leads: título + total, descrição e as ações "Importar lista" / "Criar lead". */
export default function LeadsHeader({ total, basePath, admins, currentUid, onCreated }: LeadsHeaderProps) {
  const [creating, setCreating] = useState(false);

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center gap-4">
          <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Leads</h1>
          <span
            aria-label={`${integer.format(total)} leads`}
            className="flex h-7 min-w-[38px] items-center justify-center rounded-lg bg-admin-badge px-2.5 text-sm font-semibold leading-5 text-admin-badge-text"
          >
            {integer.format(total)}
          </span>
        </div>
        <p className="text-sm font-medium leading-5 text-admin-text-description">
          Gerencie e qualifique seus leads antes de enviá-los para negociação.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-4">
        {/* Importação por planilha: próxima demanda. */}
        <Button
          variant="secondary"
          icon={FaFileImport}
          disabled
          title="Em breve"
          className="!bg-background-kpi !outline-admin-picker-border"
        >
          Importar lista
        </Button>
        <Button icon={FaPlus} onClick={() => setCreating(true)}>
          Criar lead
        </Button>
      </div>

      {creating && (
        <CreateLeadModal
          basePath={basePath}
          admins={admins}
          currentUid={currentUid}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
        />
      )}
    </header>
  );
}

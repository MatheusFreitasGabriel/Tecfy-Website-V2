"use client";

import { useState } from "react";
import { FaPlus, FaUserPlus } from "react-icons/fa6";
import type { ContactRow, PickerOption } from "@/lib/admin/crm/types";
import { emptyContactForm, type ContactForm } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import Modal from "../form/Modal";
import CreateContactModal from "../leads/CreateContactModal";
import { invalidateCrmOptions, useCrmOptions } from "../leads/crmOptionsStore";
import { contactErrorMessage } from "../contacts/ContactsView";

interface AddMemberModalProps {
  companyId: string;
  companyName: string;
  basePath: string;
  /** Já são funcionários (não aparecem na busca). */
  memberIds: Set<string>;
  onClose: () => void;
  onAdded: (contact: ContactRow) => void;
}

/** "Adicionar funcionário": contato existente (passa para esta empresa) ou contato novo. */
export default function AddMemberModal({ companyId, companyName, basePath, memberIds, onClose, onAdded }: AddMemberModalProps) {
  const contacts = useCrmOptions(basePath, "contacts");
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (member: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(await contactErrorMessage(response));
        return false;
      }
      const data = (await response.json()) as { contact: ContactRow };
      invalidateCrmOptions("contacts");
      onAdded(data.contact);
      return true;
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const options = (contacts.options ?? []).filter((o) => !memberIds.has(o.id));

  return (
    <>
      <Modal
        title="Adicionar funcionário"
        description={`Ligue uma pessoa à ${companyName}. Se ela estiver em outra empresa, passa para esta (fica no histórico).`}
        onClose={() => !busy && onClose()}
        widthClass="max-w-[560px]"
        closeStyle="boxed"
        titleSize="md"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button icon={FaUserPlus} onClick={() => picked && send({ mode: "existing", id: picked.id })} disabled={!picked || busy}>
              {busy ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {error && !creating && (
            <p role="alert" className="rounded-lg bg-admin-danger/10 px-4 py-3 text-sm font-medium text-admin-danger">
              {error}
            </p>
          )}
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-admin-picker p-3 outline outline-1 -outline-offset-1 outline-admin-picker-border">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">{picked.label}</span>
                <span className="block truncate text-xs text-admin-text-hint">{picked.hint ?? "Contato existente"}</span>
              </span>
              <Button variant="ghost" onClick={() => setPicked(null)} className="h-9 px-3">
                Trocar
              </Button>
            </div>
          ) : (
            <Combobox
              options={options}
              placeholder="Buscar contato existente"
              ariaLabel="Buscar contato existente"
              onSelect={setPicked}
              emptyText={contacts.options === null ? "Carregando cadastros..." : "Nada encontrado."}
            />
          )}
          <Button variant="secondary" icon={FaPlus} block onClick={() => setCreating(true)} disabled={busy}>
            Criar contato novo
          </Button>
        </div>
      </Modal>

      {creating && (
        <CreateContactModal
          mode="create"
          initial={{ ...emptyContactForm(), company_choice: companyId }}
          companies={[{ id: companyId, label: companyName, hint: null }]}
          leadCompanyName={null}
          busy={busy}
          serverError={error}
          onClose={() => setCreating(false)}
          onSubmit={async (form: ContactForm) => {
            if (await send({ mode: "new", draft: form })) setCreating(false);
          }}
        />
      )}
    </>
  );
}

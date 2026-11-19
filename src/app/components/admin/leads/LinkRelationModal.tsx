"use client";

import { useState } from "react";
import { FaBuilding, FaLink, FaPlus, FaUser, FaXmark } from "react-icons/fa6";
import type { LeadRow, PickerOption } from "@/lib/admin/crm/types";
import { emptyCompanyForm, emptyContactForm, type CompanyForm, type ContactForm } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import Modal from "../form/Modal";
import CreateCompanyModal from "./CreateCompanyModal";
import CreateContactModal from "./CreateContactModal";
import { invalidateCrmOptions, useCrmOptions } from "./crmOptionsStore";

type Kind = "contact" | "company";
type Choice<T> = { mode: "existing"; option: PickerOption } | { mode: "new"; draft: T } | null;

interface LinkRelationModalProps {
  kind: Kind;
  lead: LeadRow;
  basePath: string;
  onClose: () => void;
  /** O que o lead passou a ter (a tela atualiza sem recarregar). */
  onLinked: (result: { contact: LeadRow["contact"]; company: LeadRow["company"] }) => void;
}

const SERVER_ERRORS: Record<number, string> = {
  400: "Confira os dados. Se escolheu um cadastro existente, ele pode ter sido removido.",
  401: "Sua sessão expirou. Entre de novo no painel.",
  409: "Este lead já tem um vínculo desse tipo.",
};

/**
 * Vincula um contato ou uma empresa a um lead que ainda não tem: busca um cadastro existente
 * ou cria um novo (salvo no módulo correspondente). Fica registrado na timeline do lead.
 */
export default function LinkRelationModal({ kind, lead, basePath, onClose, onLinked }: LinkRelationModalProps) {
  // Carregadas só agora (modal aberto), 1x por sessão da tela. Empresas também servem ao "Criar contato".
  const contactsState = useCrmOptions(basePath, "contacts");
  const companiesState = useCrmOptions(basePath, "companies");
  const contacts = contactsState.options ?? [];
  const companies = companiesState.options ?? [];
  const loadingOptions = (kind === "contact" ? contactsState.options : companiesState.options) === null;
  const isContact = kind === "contact";
  const [choice, setChoice] = useState<Choice<ContactForm | CompanyForm>>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = isContact ? FaUser : FaBuilding;
  const noun = isContact ? "contato" : "empresa";

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    const link = choice.mode === "existing" ? { mode: "existing", id: choice.option.id } : { mode: "new", draft: choice.draft };
    try {
      const response = await fetch(`${basePath}/api/crm/leads/${lead.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isContact ? { contact: link } : { company: link }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(SERVER_ERRORS[response.status] ?? "Não foi possível vincular. Tente de novo.");
        return;
      }
      const data = (await response.json()) as { contact: LeadRow["contact"]; company: LeadRow["company"] };
      if (choice.mode === "new") invalidateCrmOptions(isContact ? "contacts" : "companies");
      onLinked(data);
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const chosenName =
    choice?.mode === "existing"
      ? choice.option.label
      : choice?.mode === "new"
        ? isContact
          ? (choice.draft as ContactForm).name
          : (choice.draft as CompanyForm).trade_name
        : null;

  return (
    <>
      <Modal
        title={isContact ? "Vincular contato" : "Vincular empresa"}
        description={`Ligue um ${noun} a “${lead.title}”. Busque um cadastro existente ou crie um novo.`}
        onClose={() => !saving && onClose()}
        widthClass="max-w-[560px]"
        closeStyle="boxed"
        titleSize="md"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button icon={FaLink} onClick={save} disabled={!choice || saving}>
              {saving ? "Vinculando..." : "Vincular"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-lg bg-admin-danger/10 px-4 py-3 text-sm font-medium text-admin-danger">
              {error}
            </p>
          )}

          {choice ? (
            <div className="flex items-center gap-3 rounded-lg bg-admin-picker p-3 outline outline-1 -outline-offset-1 outline-admin-picker-border">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
                <Icon aria-hidden className="h-3.5 w-3.5 text-admin-badge-text" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-text-primary">{chosenName}</span>
                <span className="truncate text-xs text-admin-text-hint">
                  {choice.mode === "existing" ? (choice.option.hint ?? "Cadastro existente") : `Novo · será salvo em ${isContact ? "Contatos" : "Empresas"}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setChoice(null)}
                aria-label="Escolher outro"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-badge hover:text-text-primary"
              >
                <FaXmark aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Combobox
                options={isContact ? contacts : companies}
                placeholder={isContact ? "Buscar contato existente" : "Buscar empresa existente"}
                ariaLabel={isContact ? "Buscar contato existente" : "Buscar empresa existente"}
                onSelect={(option) => setChoice({ mode: "existing", option })}
                emptyText={loadingOptions ? "Carregando cadastros..." : "Nada encontrado."}
              />
              <Button variant="secondary" icon={FaPlus} block onClick={() => setCreating(true)}>
                {isContact ? "Criar contato" : "Criar empresa"}
              </Button>
            </>
          )}
        </div>
      </Modal>

      {creating && isContact && (
        <CreateContactModal
          initial={choice?.mode === "new" ? (choice.draft as ContactForm) : emptyContactForm()}
          companies={companies}
          leadCompanyName={lead.company?.name ?? null}
          onClose={() => setCreating(false)}
          onSubmit={(draft) => {
            setChoice({ mode: "new", draft });
            setCreating(false);
          }}
        />
      )}
      {creating && !isContact && (
        <CreateCompanyModal
          initial={choice?.mode === "new" ? (choice.draft as CompanyForm) : emptyCompanyForm()}
          onClose={() => setCreating(false)}
          onSubmit={(draft) => {
            setChoice({ mode: "new", draft });
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

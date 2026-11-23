"use client";

import { useState } from "react";
import { FaBuilding, FaPen, FaPlus, FaUser, FaXmark } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { AdminUserOption, LeadRow, PickerOption } from "@/lib/admin/crm/types";
import {
  emptyCompanyForm,
  emptyContactForm,
  emptyLeadForm,
  validateLeadForm,
  type CompanyForm,
  type ContactForm,
  type CreateLeadPayload,
  type FieldErrors,
  type LeadForm,
  withoutKey,
} from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import Modal from "../form/Modal";
import CreateCompanyModal from "./CreateCompanyModal";
import LeadFields from "./LeadFields";
import CreateContactModal from "./CreateContactModal";
import { invalidateCrmOptions, useCrmOptions } from "./crmOptionsStore";

type Link<TDraft> = { mode: "none" } | { mode: "existing"; option: PickerOption } | { mode: "new"; draft: TDraft };

interface CreateLeadModalProps {
  basePath: string;
  admins: AdminUserOption[];
  /** Usuário logado (responsável padrão). */
  currentUid: string;
  onClose: () => void;
  /** Lead gravado (a lista insere na hora, sem recarregar). `contactReused` = e-mail já tinha contato. */
  onCreated: (lead: LeadRow, contactReused: boolean) => void;
}

const SERVER_ERRORS: Record<number, string> = {
  400: "Confira os campos e tente de novo. Se vinculou um cadastro existente, ele pode ter sido removido.",
  401: "Sua sessão expirou. Entre de novo no painel.",
};

/**
 * Modal "Criar lead". Contato e empresa novos ficam só aqui até salvar; aí vai tudo junto num
 * POST e o servidor grava numa transação (empresa → contato → lead).
 */
export default function CreateLeadModal({ basePath, admins, currentUid, onClose, onCreated }: CreateLeadModalProps) {
  // Buscas de contato/empresa: carregadas só agora (modal aberto), 1x por sessão da tela.
  const contacts = useCrmOptions(basePath, "contacts");
  const companies = useCrmOptions(basePath, "companies");
  /**
   * Idempotência: o mesmo id acompanha as tentativas de salvar ESTE lead (reenvio após erro de rede
   * não duplica); um id novo é gerado depois que ele é salvo.
   */
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const defaultOwner = admins.some((a) => a.uid === currentUid) ? currentUid : (admins[0]?.uid ?? "");

  const [form, setForm] = useState<LeadForm>(() => emptyLeadForm(defaultOwner));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [contact, setContact] = useState<Link<ContactForm>>({ mode: "none" });
  const [company, setCompany] = useState<Link<CompanyForm>>({ mode: "none" });
  const [subModal, setSubModal] = useState<"contact" | "company" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => withoutKey(prev, key));
  };

  const companyName =
    company.mode === "existing" ? company.option.label : company.mode === "new" ? company.draft.trade_name : null;

  const save = async (createAnother: boolean) => {
    if (submitting) return;
    setFormError(null);

    const result = validateLeadForm(
      form,
      admins.map((a) => a.uid),
    );
    if (!result.ok) {
      setErrors(result.errors);
      setFormError("Revise os campos destacados.");
      return;
    }

    const payload: CreateLeadPayload = {
      lead: form,
      contact:
        contact.mode === "existing"
          ? { mode: "existing", id: contact.option.id }
          : contact.mode === "new"
            ? { mode: "new", draft: contact.draft }
            : { mode: "none" },
      company:
        company.mode === "existing"
          ? { mode: "existing", id: company.option.id }
          : company.mode === "new"
            ? { mode: "new", draft: company.draft }
            : { mode: "none" },
    };

    setSubmitting(true);
    try {
      const response = await fetch(`${basePath}/api/crm/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, request_id: requestId }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setFormError(SERVER_ERRORS[response.status] ?? "Não foi possível salvar o lead. Tente de novo.");
        return;
      }

      const data = (await response.json()) as { lead: LeadRow | null; contactReused: boolean };
      if (data.lead) onCreated(data.lead, data.contactReused);
      if (payload.contact.mode === "new") invalidateCrmOptions("contacts");
      if (payload.company.mode === "new") invalidateCrmOptions("companies");
      setRequestId(crypto.randomUUID());
      if (!createAnother) {
        onClose();
        return;
      }
      setForm(emptyLeadForm(form.owner_uid));
      setErrors({});
      setContact({ mode: "none" });
      setCompany({ mode: "none" });
      setSavedCount((n) => n + 1);
    } catch {
      setFormError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        title="Criar lead"
        description="Cadastre a oportunidade e mantenha contato e empresa conectados."
        onClose={onClose}
        widthClass="max-w-[1120px]"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={onClose} className="sm:w-[112px] sm:px-0">
              Cancelar
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {savedCount > 0 && !formError && (
                <p role="status" className="text-xs font-medium text-admin-success">
                  {savedCount === 1 ? "Lead criado." : `${savedCount} leads criados.`} Pode cadastrar o próximo.
                </p>
              )}
              <Button variant="secondary" onClick={() => save(true)} disabled={submitting} className="sm:w-[212px]">
                Salvar e criar outro
              </Button>
              <Button onClick={() => save(false)} disabled={submitting} className="sm:w-[116px]">
                {submitting ? "Salvando..." : "Criar"}
              </Button>
            </div>
          </div>
        }
      >
        {formError && (
          <p role="alert" className="mb-5 rounded-lg bg-admin-danger/10 px-4 py-3 text-sm font-medium text-admin-danger">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_384px]">
          {/* Coluna esquerda: dados do lead */}
          <section aria-labelledby="lead-info-title" className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h3 id="lead-info-title" className="text-[17px] font-semibold leading-[23px] text-text-primary">
                Informações do lead
              </h3>
              <span className="text-xs font-medium leading-[18px] text-admin-text-hint">* Campos obrigatórios</span>
            </div>

            <LeadFields form={form} errors={errors} admins={admins} set={set} />

            <p className="pt-2 text-xs font-medium leading-[18px] text-admin-text-hint">
              Data de criação e autor da captura registrados automaticamente.
            </p>
          </section>

          {/* Coluna direita: contato e empresa */}
          <section aria-labelledby="lead-links-title" className="flex min-w-0 flex-col">
            <h3 id="lead-links-title" className="text-[17px] font-semibold leading-[23px] text-text-primary">
              Contato e empresa
            </h3>
            <p className="mt-2 text-[13px] font-medium leading-[19px] text-admin-text-description">
              Vincule um cadastro existente ou prepare um novo registro.
            </p>

            <div className="mt-[35px] flex flex-col gap-5">
              <LinkCard
                title="Contato"
                icon={FaUser}
                link={contact}
                name={contact.mode === "new" ? contact.draft.name : null}
                options={contacts.options ?? []}
                loading={contacts.options === null && !contacts.error}
                searchPlaceholder="Buscar contato existente"
                createLabel="Criar contato"
                onPick={(option) => setContact({ mode: "existing", option })}
                onCreate={() => setSubModal("contact")}
                onRemove={() => setContact({ mode: "none" })}
              />
              <LinkCard
                title="Empresa"
                icon={FaBuilding}
                link={company}
                name={company.mode === "new" ? company.draft.trade_name : null}
                options={companies.options ?? []}
                loading={companies.options === null && !companies.error}
                searchPlaceholder="Buscar empresa existente"
                createLabel="Criar empresa"
                onPick={(option) => setCompany({ mode: "existing", option })}
                onCreate={() => setSubModal("company")}
                onRemove={() => setCompany({ mode: "none" })}
              />

              <div className="rounded-lg bg-admin-tip px-[18px] py-[13px]">
                <p className="text-[13px] font-semibold leading-[19px] text-admin-tip-title">Um cadastro, tudo conectado</p>
                <p className="mt-1.5 text-xs font-medium leading-[18px] text-admin-tip-text">
                  Os novos contatos e empresas serão criados nos módulos correspondentes ao salvar o lead.
                </p>
              </div>
            </div>
          </section>
        </div>
      </Modal>

      {subModal === "contact" && (
        <CreateContactModal
          initial={contact.mode === "new" ? contact.draft : emptyContactForm()}
          companies={companies.options ?? []}
          leadCompanyName={companyName}
          onClose={() => setSubModal(null)}
          onSubmit={(draft) => {
            setContact({ mode: "new", draft });
            setSubModal(null);
          }}
        />
      )}
      {subModal === "company" && (
        <CreateCompanyModal
          initial={company.mode === "new" ? company.draft : emptyCompanyForm()}
          onClose={() => setSubModal(null)}
          onSubmit={(draft) => {
            setCompany({ mode: "new", draft });
            setSubModal(null);
          }}
        />
      )}
    </>
  );
}

interface LinkCardProps<TDraft> {
  title: string;
  icon: IconType;
  link: Link<TDraft>;
  /** Nome do rascunho novo (quando `link.mode === "new"`). */
  name: string | null;
  options: PickerOption[];
  /** A lista ainda está sendo carregada. */
  loading: boolean;
  searchPlaceholder: string;
  createLabel: string;
  onPick: (option: PickerOption) => void;
  onCreate: () => void;
  onRemove: () => void;
}

/** Cartão "Contato"/"Empresa": busca um existente ou cria novo; depois mostra o vínculo escolhido. */
function LinkCard<TDraft>({
  title,
  icon: Icon,
  link,
  name,
  options,
  loading,
  searchPlaceholder,
  createLabel,
  onPick,
  onCreate,
  onRemove,
}: LinkCardProps<TDraft>) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-admin-card p-5 outline outline-1 -outline-offset-1 outline-admin-card-border">
      <h4 className="text-[15px] font-semibold leading-[21px] text-text-primary">{title}</h4>

      {link.mode === "none" ? (
        <>
          <div className="mt-[3px]">
            <Combobox
              options={options}
              placeholder={searchPlaceholder}
              ariaLabel={searchPlaceholder}
              onSelect={onPick}
              emptyText={loading ? "Carregando cadastros..." : options.length ? "Nada encontrado." : "Nenhum cadastro ainda."}
            />
          </div>
          <Button variant="secondary" icon={FaPlus} block onClick={onCreate}>
            {createLabel}
          </Button>
          <p className="text-xs font-medium leading-[18px] text-admin-text-hint">Opcional · vincule sem sair deste cadastro.</p>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-lg bg-admin-picker p-3 outline outline-1 -outline-offset-1 outline-admin-picker-border">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
            <Icon aria-hidden className="h-3.5 w-3.5 text-admin-badge-text" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-text-primary">
              {link.mode === "existing" ? link.option.label : name}
            </span>
            <span className="truncate text-xs text-admin-text-hint">
              {link.mode === "existing" ? (link.option.hint ?? "Cadastro existente") : "Novo · será criado ao salvar o lead"}
            </span>
          </span>
          {link.mode === "new" && (
            <button
              type="button"
              onClick={onCreate}
              aria-label={`Editar ${title.toLowerCase()}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-badge hover:text-text-primary"
            >
              <FaPen aria-hidden className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${title.toLowerCase()}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-badge hover:text-text-primary"
          >
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

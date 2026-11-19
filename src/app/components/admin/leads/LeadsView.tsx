"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { leadQualifications, leadStages, leadStatuses, type LeadQualification } from "@/lib/admin/crm/options";
import { templateContextFromLead } from "@/lib/admin/crm/templates";
import type { AdminUserOption, LeadEmailRow, LeadNoteRow, LeadRow, MessageTemplate, TemplateChannel } from "@/lib/admin/crm/types";
import { BULK_MAX_IDS } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import AssignOwnerDialog from "./AssignOwnerDialog";
import BulkActionsBar, { type BulkField } from "./BulkActionsBar";
import EmailComposer from "./EmailComposer";
import LeadDetailsDrawer, { contactChannelsOf, type LeadActivity } from "./LeadDetailsDrawer";
import LeadsFilterDrawer from "./LeadsFilterDrawer";
import LeadsHeader from "./LeadsHeader";
import LeadsPagination, { PAGE_SIZES } from "./LeadsPagination";
import LeadsTable from "./LeadsTable";
import LeadsToolbar from "./LeadsToolbar";
import LinkRelationModal from "./LinkRelationModal";
import TemplatesManager from "./TemplatesManager";
import WhatsAppComposer from "./WhatsAppComposer";
import { exportLeadsCsv } from "./exportCsv";
import { DEFAULT_FILTERS, activeChips, applyFilters, countActiveFilters, type LeadFilters } from "./leadFilters";

interface LeadsViewProps {
  leads: LeadRow[];
  /** A lista bateu no limite de carregamento (há leads mais antigos fora). */
  truncated: boolean;
  basePath: string;
  currentUid: string;
  /** Nome do usuário logado (variável {responsavel} quando o lead não tem responsável). */
  currentUserName: string | null;
  templates: MessageTemplate[];
  /** Usuários do painel (responsável). */
  admins: AdminUserOption[];
}

type Notice = { tone: "success" | "error"; text: string };
type PendingConfirm = { kind: "convert" | "delete"; ids: string[] };
type Composer = { kind: "whatsapp"; leadId: string } | { kind: "email"; leadId: string; configured: boolean };
type BulkResponse = { updated: number; ids: string[]; deals?: { id: string; deal_id: string }[]; owner?: { uid: string; name: string } };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("#", String(n)));
const todayStamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Tela de trabalho dos leads.
 *
 * Requisições mínimas:
 *  - a lista vem do servidor (com cache) UMA vez; nenhuma ação recarrega a lista inteira;
 *  - ações devolvem só o que mudou e a tela aplica numa camada local (`patches`, `added`, `removed`)
 *    por cima da lista do servidor; "Atualizar lista" busca de novo e zera essa camada;
 *  - a atividade do lead (observações + e-mails) vem em 1 requisição e fica guardada por lead.
 * Busca/filtros/paginação rodam no navegador.
 */
export default function LeadsView({ leads, truncated, basePath, currentUid, currentUserName, templates: serverTemplates, admins }: LeadsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Lead pedido pela URL (?lead=id), ex.: ao clicar numa notificação do sino. */
  const urlLead = searchParams.get("lead");
  const urlKey = searchParams.toString();
  const [dismissedUrlKey, setDismissedUrlKey] = useState<string | null>(null);

  // ── Camada local sobre a lista do servidor ──
  const [patches, setPatches] = useState<Record<string, Partial<LeadRow>>>({});
  const [added, setAdded] = useState<LeadRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [templates, setTemplates] = useState(serverTemplates);
  // Chegou lista nova do servidor ("Atualizar lista"): ela já reflete tudo → zera a camada local.
  const [baseLeads, setBaseLeads] = useState(leads);
  const [baseTemplates, setBaseTemplates] = useState(serverTemplates);
  if (baseLeads !== leads) {
    setBaseLeads(leads);
    setPatches({});
    setAdded([]);
    setRemoved(new Set());
  }
  if (baseTemplates !== serverTemplates) {
    setBaseTemplates(serverTemplates);
    setTemplates(serverTemplates);
  }

  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[0]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState<TemplateChannel | null>(null);
  const [reloading, startReload] = useTransition();
  const [assign, setAssign] = useState<{ ids: string[]; currentOwnerUid: string | null; fromSelection: boolean } | null>(null);
  const [linking, setLinking] = useState<{ leadId: string; kind: "contact" | "company" } | null>(null);
  /** "Agora" fixado ao montar (filtros de data). */
  const [now] = useState(() => new Date());

  // ── Atividade por lead (observações + e-mails), guardada em memória ──
  const [activity, setActivity] = useState<Record<string, LeadActivity>>({});
  const [activityError, setActivityError] = useState<Record<string, boolean>>({});
  const activityInflight = useRef(new Set<string>());

  const rows = useMemo(() => {
    const serverIds = new Set(leads.map((l) => l.id));
    return [...added.filter((l) => !serverIds.has(l.id)), ...leads]
      .filter((l) => !removed.has(l.id))
      .map((l) => (patches[l.id] ? { ...l, ...patches[l.id] } : l));
  }, [leads, added, removed, patches]);
  const filtered = useMemo(() => applyFilters(rows, filters, currentUid, now), [rows, filters, currentUid, now]);

  const ownerNames = useMemo(() => new Map(rows.filter((l) => l.owner_uid).map((l) => [l.owner_uid!, l.owner_name ?? "—"])), [rows]);
  const chips = useMemo(() => activeChips(filters, ownerNames), [filters, ownerNames]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const selectedIds = useMemo(() => rows.filter((l) => selected.has(l.id)).map((l) => l.id), [rows, selected]);
  const openId = detailsId ?? (urlLead && urlKey !== dismissedUrlKey ? urlLead : null);
  const detailsLead = openId ? rows.find((l) => l.id === openId) : undefined;
  const composerLead = composer ? rows.find((l) => l.id === composer.leadId) : undefined;
  const linkingLead = linking ? rows.find((l) => l.id === linking.leadId) : undefined;

  /** Aplica campos novos em vários leads (sem ir ao servidor). */
  const patchLeads = (ids: string[], fields: Partial<LeadRow>) =>
    setPatches((p) => {
      const next = { ...p };
      for (const id of ids) next[id] = { ...next[id], ...fields };
      return next;
    });

  /** Esquece a atividade guardada (ex.: houve registro automático na timeline) — recarrega ao abrir. */
  const forgetActivity = (ids: string[]) =>
    setActivity((a) => {
      const next = { ...a };
      for (const id of ids) delete next[id];
      return next;
    });

  const loadActivity = useCallback(
    async (id: string) => {
      if (activityInflight.current.has(id)) return;
      activityInflight.current.add(id);
      try {
        const response = await fetch(`${basePath}/api/crm/leads/${id}/activity`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as LeadActivity;
        setActivity((a) => ({ ...a, [id]: data }));
        setActivityError((e) => ({ ...e, [id]: false }));
      } catch {
        setActivityError((e) => ({ ...e, [id]: true }));
      } finally {
        activityInflight.current.delete(id);
      }
    },
    [basePath],
  );

  // Painel aberto sem atividade guardada → 1 requisição (reabrir o mesmo lead não repete).
  useEffect(() => {
    if (!openId || activity[openId] || activityError[openId]) return;
    const timer = setTimeout(() => void loadActivity(openId), 0);
    return () => clearTimeout(timer);
  }, [openId, activity, activityError, loadActivity]);

  const closeDetails = () => {
    setDetailsId(null);
    if (urlLead) {
      setDismissedUrlKey(urlKey);
      router.replace(pathname, { scroll: false });
    }
  };

  const changeFilters = (next: LeadFilters) => {
    setFilters(next);
    setPage(1);
  };

  const callBulk = async (body: { ids: string[]; action: string; value?: string }): Promise<BulkResponse | null> => {
    try {
      const response = await fetch(`${basePath}/api/crm/leads/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setNotice({ tone: "error", text: "Sua sessão expirou. Entre de novo no painel." });
        return null;
      }
      if (!response.ok) {
        setNotice({ tone: "error", text: "Não foi possível concluir a ação. Tente de novo." });
        return null;
      }
      return (await response.json()) as BulkResponse;
    } catch {
      setNotice({ tone: "error", text: "Sem conexão com o servidor. Tente de novo." });
      return null;
    }
  };

  /** Em lotes de até 200 ids; junta as respostas. */
  const runBatched = async (ids: string[], action: string, value?: string): Promise<BulkResponse | null> => {
    const total: BulkResponse = { updated: 0, ids: [], deals: [] };
    for (let i = 0; i < ids.length; i += BULK_MAX_IDS) {
      const result = await callBulk({ ids: ids.slice(i, i + BULK_MAX_IDS), action, value });
      if (!result) return total.updated ? total : null;
      total.updated += result.updated;
      total.ids.push(...result.ids);
      total.deals!.push(...(result.deals ?? []));
      if (result.owner) total.owner = result.owner;
    }
    return total;
  };

  /** Troca a qualificação de 1 lead direto na lista (otimista, desfaz se falhar). */
  const changeQualification = async (id: string, value: LeadQualification) => {
    setNotice(null);
    const previous = patches[id];
    patchLeads([id], { qualification: value });
    setPending((p) => new Set(p).add(id));
    const result = await callBulk({ ids: [id], action: "set_qualification", value });
    setPending((p) => {
      const next = new Set(p);
      next.delete(id);
      return next;
    });
    if (!result) {
      setPatches((p) => {
        const next = { ...p };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
    }
  };

  const setField = async (field: BulkField, value: string) => {
    if (!selectedIds.length) return;
    setBusy(true);
    setNotice(null);
    const result = await runBatched(selectedIds, `set_${field}`, value);
    setBusy(false);
    if (!result) return;
    patchLeads(result.ids, { [field]: value } as Partial<LeadRow>);
    const label =
      field === "qualification" ? leadQualifications.label(value) : field === "stage" ? leadStages.label(value) : leadStatuses.label(value);
    setNotice({ tone: "success", text: `${plural(result.updated, "1 lead atualizado", "# leads atualizados")} para “${label}”.` });
    setSelected(new Set());
  };

  /** Busca a lista de novo no servidor (filtros, página e seleção continuam). */
  const reloadList = () => {
    setNotice(null);
    setActivity({});
    setActivityError({});
    startReload(() => router.refresh());
  };

  const runAssign = async (uid: string) => {
    if (!assign) return;
    setBusy(true);
    setNotice(null);
    const result = await runBatched(assign.ids, "set_owner", uid);
    setBusy(false);
    if (!result) return;
    const name = result.owner?.name ?? admins.find((a) => a.uid === uid)?.name ?? "responsável";
    patchLeads(result.ids, { owner_uid: uid, owner_name: name });
    forgetActivity(result.ids); // a timeline ganhou um registro automático
    setNotice({
      tone: "success",
      text: result.updated === 0 ? `Os leads já eram de ${name}.` : `${plural(result.updated, "1 lead atribuído", "# leads atribuídos")} a ${name}.`,
    });
    if (assign.fromSelection) setSelected(new Set());
    setAssign(null);
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    setNotice(null);
    const result = await runBatched(confirm.ids, confirm.kind);
    setBusy(false);
    setConfirm(null);
    if (!result) return;
    if (confirm.kind === "delete") {
      setRemoved((r) => new Set([...r, ...result.ids]));
      setNotice({ tone: "success", text: `${plural(result.updated, "1 lead excluído", "# leads excluídos")}.` });
      if (openId && result.ids.includes(openId)) closeDetails();
    } else {
      for (const deal of result.deals ?? []) {
        patchLeads([deal.id], { deal_id: deal.deal_id, stage: "em_negociacao", status: "convertido" });
      }
      const skipped = confirm.ids.length - result.updated;
      setNotice({
        tone: "success",
        text:
          `${plural(result.updated, "1 lead convertido", "# leads convertidos")} em negociação.` +
          (skipped > 0 ? ` ${plural(skipped, "1 já estava convertido", "# já estavam convertidos")}.` : ""),
      });
    }
    setSelected(new Set());
  };

  const onLeadCreated = (lead: LeadRow, contactReused: boolean) => {
    setAdded((a) => [lead, ...a.filter((l) => l.id !== lead.id)]);
    setRemoved((r) => {
      if (!r.has(lead.id)) return r;
      const next = new Set(r);
      next.delete(lead.id);
      return next;
    });
    setNotice({
      tone: "success",
      text: contactReused
        ? `Lead “${lead.title}” criado. O e-mail do contato já estava cadastrado, então o contato existente foi vinculado.`
        : `Lead “${lead.title}” criado.`,
    });
  };

  const onNoteAdded = (leadId: string, note: LeadNoteRow) =>
    setActivity((a) => (a[leadId] ? { ...a, [leadId]: { ...a[leadId], notes: [note, ...a[leadId].notes] } } : a));

  const onEmailSent = (leadId: string, email: LeadEmailRow) => {
    patchLeads([leadId], { last_contact_at: email.created_at });
    setActivity((a) => (a[leadId] ? { ...a, [leadId]: { ...a[leadId], emails: [email, ...a[leadId].emails] } } : a));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = (select: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const row of pageRows) {
        if (select) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });

  const exportFiltered = () => exportLeadsCsv(filtered, `leads-${todayStamp()}.csv`);
  const exportSelected = () =>
    exportLeadsCsv(
      rows.filter((l) => selected.has(l.id)),
      `leads-selecionados-${todayStamp()}.csv`,
    );

  const confirmCount = confirm?.ids.length ?? 0;
  const emailTemplates = templates.filter((t) => t.channel === "email");
  const whatsappTemplates = templates.filter((t) => t.channel === "whatsapp");

  return (
    <div className="flex flex-col gap-8">
      <LeadsHeader total={rows.length} basePath={basePath} admins={admins} currentUid={currentUid} onCreated={onLeadCreated} />

      <section aria-label="Leads" className="flex flex-col gap-6">
        <LeadsToolbar
          filters={filters}
          chips={chips}
          activeCount={countActiveFilters(filters)}
          resultCount={filtered.length}
          onChange={changeFilters}
          onOpenFilters={() => setFiltersOpen(true)}
          onExport={exportFiltered}
          onOpenTemplates={() => setTemplatesOpen("whatsapp")}
          onReload={reloadList}
          reloading={reloading}
        />

        {truncated && (
          <p role="status" className="rounded-lg bg-admin-qual-hot px-4 py-3 text-sm font-medium text-admin-qual-hot-text">
            Mostrando os {rows.length.toLocaleString("pt-BR")} leads mais recentes. Os mais antigos não estão nesta lista.
          </p>
        )}

        {selectedIds.length > 0 && (
          <BulkActionsBar
            count={selectedIds.length}
            busy={busy}
            onConvert={() => setConfirm({ kind: "convert", ids: selectedIds })}
            onDelete={() => setConfirm({ kind: "delete", ids: selectedIds })}
            onSet={setField}
            onExport={exportSelected}
            onAssign={() => setAssign({ ids: selectedIds, currentOwnerUid: null, fromSelection: true })}
            onClear={() => setSelected(new Set())}
          />
        )}

        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              notice.tone === "error" ? "bg-admin-danger/10 text-admin-danger" : "bg-admin-success/10 text-admin-success"
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="overflow-hidden rounded-xl bg-admin-table outline outline-1 -outline-offset-1 outline-admin-table-border">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-base font-semibold text-text-primary">Nenhum lead ainda</p>
              <p className="text-sm text-admin-text-description">Crie o primeiro em “Criar lead” ou aguarde os contatos do site.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <p className="text-sm text-admin-text-description">Nenhum lead encontrado com essa busca e filtros.</p>
              <Button variant="secondary" onClick={() => changeFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>
                Limpar busca e filtros
              </Button>
            </div>
          ) : (
            <>
              <LeadsTable
                rows={pageRows}
                selected={selected}
                onToggle={toggle}
                onTogglePage={togglePage}
                dateSort={filters.sort === "recent" ? "desc" : filters.sort === "oldest" ? "asc" : null}
                onToggleDateSort={() => changeFilters({ ...filters, sort: filters.sort === "recent" ? "oldest" : "recent" })}
                onQualificationChange={changeQualification}
                pending={pending}
                onOpenDetails={setDetailsId}
                onWhatsApp={(leadId) => setComposer({ kind: "whatsapp", leadId })}
              />
              <LeadsPagination
                page={currentPage}
                pageCount={pageCount}
                perPage={perPage}
                total={filtered.length}
                onPage={setPage}
                onPerPage={(size) => {
                  setPerPage(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </div>
      </section>

      {filtersOpen && (
        <LeadsFilterDrawer
          leads={rows}
          filters={filters}
          currentUid={currentUid}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            changeFilters(next);
            setFiltersOpen(false);
          }}
        />
      )}

      {detailsLead && (
        <LeadDetailsDrawer
          key={detailsLead.id}
          lead={detailsLead}
          basePath={basePath}
          busy={busy}
          activity={activity[detailsLead.id] ?? null}
          activityError={Boolean(activityError[detailsLead.id])}
          onRetryActivity={() => {
            setActivityError((e) => ({ ...e, [detailsLead.id]: false }));
          }}
          onNoteAdded={(note) => onNoteAdded(detailsLead.id, note)}
          onClose={closeDetails}
          onConvert={() => setConfirm({ kind: "convert", ids: [detailsLead.id] })}
          onWhatsApp={() => setComposer({ kind: "whatsapp", leadId: detailsLead.id })}
          onEmail={(configured) => setComposer({ kind: "email", leadId: detailsLead.id, configured })}
          onAssign={() => setAssign({ ids: [detailsLead.id], currentOwnerUid: detailsLead.owner_uid, fromSelection: false })}
          onLink={(kind) => setLinking({ leadId: detailsLead.id, kind })}
        />
      )}

      {composer?.kind === "whatsapp" && composerLead && (
        <WhatsAppComposer
          phones={contactChannelsOf(composerLead).phones}
          templates={whatsappTemplates}
          context={templateContextFromLead(composerLead, currentUserName)}
          onClose={() => setComposer(null)}
          onManageTemplates={() => setTemplatesOpen("whatsapp")}
        />
      )}

      {composer?.kind === "email" && composerLead && (
        <EmailComposer
          basePath={basePath}
          leadId={composerLead.id}
          recipients={contactChannelsOf(composerLead).emails}
          templates={emailTemplates}
          context={templateContextFromLead(composerLead, currentUserName)}
          configured={composer.configured}
          onClose={() => setComposer(null)}
          onManageTemplates={() => setTemplatesOpen("email")}
          onSent={(email) => {
            setComposer(null);
            if (email) onEmailSent(composerLead.id, email);
            setNotice({ tone: "success", text: `E-mail enviado para ${composerLead.title}.` });
          }}
        />
      )}

      {assign && (
        <AssignOwnerDialog
          admins={admins}
          currentOwnerUid={assign.currentOwnerUid}
          count={assign.ids.length}
          busy={busy}
          onCancel={() => setAssign(null)}
          onConfirm={runAssign}
        />
      )}

      {linking && linkingLead && (
        <LinkRelationModal
          kind={linking.kind}
          lead={linkingLead}
          basePath={basePath}
          onClose={() => setLinking(null)}
          onLinked={(result) => {
            patchLeads([linking.leadId], {
              ...(result.contact ? { contact: result.contact } : {}),
              ...(result.company ? { company: result.company } : {}),
            });
            forgetActivity([linking.leadId]); // a timeline ganhou um registro automático
            setNotice({ tone: "success", text: linking.kind === "contact" ? "Contato vinculado ao lead." : "Empresa vinculada ao lead." });
            setLinking(null);
          }}
        />
      )}

      {templatesOpen && (
        <TemplatesManager
          basePath={basePath}
          templates={templates}
          initialChannel={templatesOpen}
          onChange={setTemplates}
          onClose={() => setTemplatesOpen(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "delete" ? "Excluir leads" : "Converter em negociação"}
          tone={confirm.kind === "delete" ? "danger" : "primary"}
          confirmLabel={confirm.kind === "delete" ? "Excluir" : "Converter"}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
          message={
            confirm.kind === "delete" ? (
              <>
                {plural(confirmCount, "1 lead será excluído", "# leads serão excluídos")} definitivamente. Contatos e empresas
                vinculados continuam cadastrados. Essa ação não pode ser desfeita.
              </>
            ) : (
              <>
                {plural(confirmCount, "1 lead vai virar uma negociação", "# leads vão virar negociações")}: a etapa muda para
                “Em negociação” e o status para “Convertido”. Leads já convertidos são ignorados.
              </>
            )
          }
        />
      )}
    </div>
  );
}

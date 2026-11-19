"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { leadQualifications, leadStages, leadStatuses, type LeadQualification, type LeadStage, type LeadStatus } from "@/lib/admin/crm/options";
import { templateContextFromLead } from "@/lib/admin/crm/templates";
import type { AdminUserOption, LeadRow, MessageTemplate, PickerOption, TemplateChannel } from "@/lib/admin/crm/types";
import { BULK_MAX_IDS } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import AssignOwnerDialog from "./AssignOwnerDialog";
import BulkActionsBar, { type BulkField } from "./BulkActionsBar";
import EmailComposer from "./EmailComposer";
import LeadDetailsDrawer, { contactChannelsOf } from "./LeadDetailsDrawer";
import LeadsFilterDrawer from "./LeadsFilterDrawer";
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
  basePath: string;
  currentUid: string;
  /** Nome do usuário logado (variável {responsavel} quando o lead não tem responsável). */
  currentUserName: string | null;
  templates: MessageTemplate[];
  /** Usuários do painel (atribuir responsável). */
  admins: AdminUserOption[];
  /** Cadastros existentes para "Vincular contato/empresa". */
  contacts: PickerOption[];
  companies: PickerOption[];
}

type Notice = { tone: "success" | "error"; text: string };
type QuickField = "qualification" | "stage" | "status";
type QuickPatch = Partial<{ qualification: LeadQualification; stage: LeadStage; status: LeadStatus }>;
type PendingConfirm = { kind: "convert" | "delete"; ids: string[] };
type Composer = { kind: "whatsapp"; leadId: string } | { kind: "email"; leadId: string; configured: boolean };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("#", String(n)));
const todayStamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Tela de trabalho dos leads: indicadores, busca, filtros (rápidos + painel), seleção em massa,
 * qualificação na linha, painel de detalhes, WhatsApp/e-mail com modelos e exportação CSV.
 * Busca/filtros/paginação rodam no navegador sobre os leads carregados.
 */
export default function LeadsView({ leads, basePath, currentUid, currentUserName, templates, admins, contacts, companies }: LeadsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Lead pedido pela URL (?lead=id), ex.: ao clicar numa notificação do sino. */
  const urlLead = searchParams.get("lead");
  const urlKey = searchParams.toString();
  const [dismissedUrlKey, setDismissedUrlKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[0]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  /** Mudanças rápidas (qualificação/etapa/status) mostradas antes do servidor confirmar. */
  const [overrides, setOverrides] = useState<Record<string, QuickPatch>>({});
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState<TemplateChannel | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  /** Recarrega a timeline do painel depois de registros automáticos (atribuição, vínculo). */
  const [notesVersion, setNotesVersion] = useState(0);
  const [reloading, startReload] = useTransition();
  const [assign, setAssign] = useState<{ ids: string[]; currentOwnerUid: string | null; fromSelection: boolean } | null>(null);
  const [linking, setLinking] = useState<{ leadId: string; kind: "contact" | "company" } | null>(null);
  /** "Agora" fixado ao montar (filtros de data e KPIs); recarregar atualiza. */
  const [now] = useState(() => new Date());

  const rows = useMemo(
    () => leads.map((lead) => (overrides[lead.id] ? { ...lead, ...overrides[lead.id] } : lead)),
    [leads, overrides],
  );
  const filtered = useMemo(() => applyFilters(rows, filters, currentUid, now), [rows, filters, currentUid, now]);

  const ownerNames = useMemo(() => new Map(leads.filter((l) => l.owner_uid).map((l) => [l.owner_uid!, l.owner_name ?? "—"])), [leads]);
  const chips = useMemo(() => activeChips(filters, ownerNames), [filters, ownerNames]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const selectedIds = useMemo(() => leads.filter((l) => selected.has(l.id)).map((l) => l.id), [leads, selected]);
  const openId = detailsId ?? (urlLead && urlKey !== dismissedUrlKey ? urlLead : null);
  const detailsLead = openId ? rows.find((l) => l.id === openId) : undefined;
  const composerLead = composer ? rows.find((l) => l.id === composer.leadId) : undefined;
  const linkingLead = linking ? rows.find((l) => l.id === linking.leadId) : undefined;

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

  const callBulk = async (body: { ids: string[]; action: string; value?: string }): Promise<number | null> => {
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
      const data = (await response.json()) as { updated?: number };
      return data.updated ?? 0;
    } catch {
      setNotice({ tone: "error", text: "Sem conexão com o servidor. Tente de novo." });
      return null;
    }
  };

  /** Troca a qualificação de 1 lead direto na lista (otimista, desfaz se falhar). */
  const changeField = async (id: string, field: QuickField, value: string): Promise<boolean> => {
    setNotice(null);
    const previous = overrides[id];
    setOverrides((o) => ({ ...o, [id]: { ...o[id], [field]: value } }));
    setPending((p) => new Set(p).add(id));
    const updated = await callBulk({ ids: [id], action: `set_${field}`, value });
    setPending((p) => {
      const next = new Set(p);
      next.delete(id);
      return next;
    });
    if (updated === null) {
      setOverrides((o) => {
        const next = { ...o };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      return false;
    }
    router.refresh();
    return true;
  };

  const runBatched = async (ids: string[], action: string, value?: string) => {
    let total = 0;
    for (let i = 0; i < ids.length; i += BULK_MAX_IDS) {
      const updated = await callBulk({ ids: ids.slice(i, i + BULK_MAX_IDS), action, value });
      if (updated === null) return null;
      total += updated;
    }
    return total;
  };

  const setField = async (field: BulkField, value: string) => {
    if (!selectedIds.length) return;
    setBusy(true);
    setNotice(null);
    const updated = await runBatched(selectedIds, `set_${field}`, value);
    setBusy(false);
    if (updated === null) return;
    const label =
      field === "qualification" ? leadQualifications.label(value) : field === "stage" ? leadStages.label(value) : leadStatuses.label(value);
    setNotice({ tone: "success", text: `${plural(updated, "1 lead atualizado", "# leads atualizados")} para “${label}”.` });
    setSelected(new Set());
    router.refresh();
  };

  /**
   * Busca os leads de novo no servidor sem recarregar a página: busca, filtros, página e seleção
   * continuam. Também recarrega a timeline e os e-mails do painel aberto.
   */
  const reloadList = () => {
    setNotice(null);
    startReload(() => router.refresh());
    setNotesVersion((v) => v + 1);
    setHistoryVersion((v) => v + 1);
  };

  const runAssign = async (uid: string) => {
    if (!assign) return;
    setBusy(true);
    setNotice(null);
    const updated = await runBatched(assign.ids, "set_owner", uid);
    setBusy(false);
    if (updated === null) return;
    const name = admins.find((a) => a.uid === uid)?.name ?? "responsável";
    setNotice({
      tone: "success",
      text: updated === 0 ? `Os leads já eram de ${name}.` : `${plural(updated, "1 lead atribuído", "# leads atribuídos")} a ${name}.`,
    });
    if (assign.fromSelection) setSelected(new Set());
    setAssign(null);
    setNotesVersion((v) => v + 1);
    router.refresh();
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    setNotice(null);
    const updated = await runBatched(confirm.ids, confirm.kind);
    setBusy(false);
    setConfirm(null);
    if (updated === null) return;
    if (confirm.kind === "delete") {
      setNotice({ tone: "success", text: `${plural(updated, "1 lead excluído", "# leads excluídos")}.` });
      if (openId && confirm.ids.includes(openId)) closeDetails();
    } else {
      const skipped = confirm.ids.length - updated;
      setNotice({
        tone: "success",
        text:
          `${plural(updated, "1 lead convertido", "# leads convertidos")} em negociação.` +
          (skipped > 0 ? ` ${plural(skipped, "1 já estava convertido", "# já estavam convertidos")}.` : ""),
      });
    }
    setSelected(new Set());
    router.refresh();
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
        {leads.length === 0 ? (
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
              onQualificationChange={(id, value) => changeField(id, "qualification", value)}
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
          historyVersion={historyVersion}
          onClose={closeDetails}
          onConvert={() => setConfirm({ kind: "convert", ids: [detailsLead.id] })}
          onWhatsApp={() => setComposer({ kind: "whatsapp", leadId: detailsLead.id })}
          onEmail={(configured) => setComposer({ kind: "email", leadId: detailsLead.id, configured })}
          onAssign={() => setAssign({ ids: [detailsLead.id], currentOwnerUid: detailsLead.owner_uid, fromSelection: false })}
          onLink={(kind) => setLinking({ leadId: detailsLead.id, kind })}
          notesVersion={notesVersion}
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
          onSent={() => {
            setComposer(null);
            setHistoryVersion((v) => v + 1);
            setNotice({ tone: "success", text: `E-mail enviado para ${composerLead.title}.` });
            router.refresh();
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
          contacts={contacts}
          companies={companies}
          onClose={() => setLinking(null)}
          onLinked={() => {
            setNotice({ tone: "success", text: linking.kind === "contact" ? "Contato vinculado ao lead." : "Empresa vinculada ao lead." });
            setLinking(null);
            setNotesVersion((v) => v + 1);
            router.refresh();
          }}
        />
      )}

      {templatesOpen && (
        <TemplatesManager basePath={basePath} templates={templates} initialChannel={templatesOpen} onClose={() => setTemplatesOpen(null)} />
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
    </section>
  );
}

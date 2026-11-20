"use client";

import Link from "next/link";
import {
  FaArrowUpRightFromSquare,
  FaBuilding,
  FaCalendarCheck,
  FaCheck,
  FaEnvelope,
  FaFileArrowUp,
  FaLightbulb,
  FaPen,
  FaPlus,
  FaUser,
  FaWhatsapp,
} from "react-icons/fa6";
import { dealOrigins, leadSources, taskTypes } from "@/lib/admin/crm/options";
import type { DealDetail, DealFileRow, DealHistoryRow, Pipeline, TaskRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { formatCalendarDate, formatDate, formatDateTime, formatPhone } from "../leads/leadVisuals";
import { Stars, brazilDate, formatMoney } from "../deals/dealVisuals";

interface OverviewTabProps {
  deal: DealDetail;
  pipeline: Pipeline;
  tasks: TaskRow[];
  files: DealFileRow[];
  history: DealHistoryRow[];
  now: number | null;
  basePath: string;
  busy: boolean;
  emailConfigured: boolean;
  onQualify: (stars: number) => void;
  onEdit: () => void;
  onTask: () => void;
  onWhatsApp: () => void;
  onEmail: (to: "contact" | "company") => void;
  onLink: (target: "contact" | "company") => void;
  onTaskDone: (task: TaskRow) => void;
  onGo: (tab: "history" | "tasks" | "files") => void;
}

const DAY = 86_400_000;
const formatCnpj = (v: string | null) => (v ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—");
const daysSince = (iso: string | null, now: number | null) => (iso && now !== null ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Step {
  id: string;
  text: string;
  action?: { label: string; onClick: () => void };
  tone?: "warning" | "danger";
}

/** Próximos passos recomendados: regras simples sobre a negociação (o que falta para avançar). */
function recommendations(p: OverviewTabProps): Step[] {
  const { deal, tasks, files, pipeline, now } = p;
  if (deal.status === "vendida") return [{ id: "won", text: "Venda fechada. Combine a implantação com o cliente e registre os próximos passos como tarefas.", action: { label: "Criar tarefa", onClick: p.onTask } }];
  if (deal.status === "perdida") return [{ id: "lost", text: "Negociação perdida. Se o cliente voltar a ter interesse, reabra para continuar daqui." }];
  const steps: Step[] = [];
  const open = tasks.filter((t) => !t.done_at);
  const overdue = now === null ? [] : open.filter((t) => Date.parse(t.due_at) < now);
  if (overdue.length) steps.push({ id: "overdue", tone: "danger", text: `${plural(overdue.length, "tarefa atrasada", "tarefas atrasadas")}. Resolva ou reagende para não esfriar a negociação.`, action: { label: "Ver tarefas", onClick: () => p.onGo("tasks") } });
  if (!open.length) steps.push({ id: "notask", tone: "warning", text: "Nenhum próximo passo agendado. Toda negociação ativa precisa de uma tarefa com data.", action: { label: "Agendar follow-up", onClick: p.onTask } });
  const idle = daysSince(deal.last_activity_at, now);
  if (idle !== null && idle >= 5 && deal.status === "em_andamento") {
    steps.push({ id: "idle", tone: "warning", text: `Sem atividade há ${plural(idle, "dia", "dias")}. Retome o contato.`, action: deal.contact_info?.phone ? { label: "Abrir WhatsApp", onClick: p.onWhatsApp } : undefined });
  }
  if (deal.value_cents === null) steps.push({ id: "value", text: "Defina o valor da negociação para entrar na previsão de vendas.", action: { label: "Definir valor", onClick: p.onEdit } });
  if (!deal.expected_close_date) steps.push({ id: "close", text: "Defina a previsão de fechamento.", action: { label: "Definir data", onClick: p.onEdit } });
  else if (now !== null && deal.expected_close_date < brazilDate(now)) steps.push({ id: "late", tone: "danger", text: `A previsão de fechamento (${formatCalendarDate(deal.expected_close_date)}) já passou. Atualize a data ou avance a negociação.`, action: { label: "Atualizar", onClick: p.onEdit } });
  const stage = pipeline.stages.find((s) => s.id === deal.stage_id);
  if (stage && /propost/i.test(stage.name) && !files.some((f) => f.kind === "proposta")) steps.push({ id: "proposal", text: "Etapa de proposta sem proposta anexada. Anexe o PDF enviado ao cliente.", action: { label: "Anexar proposta", onClick: () => p.onGo("files") } });
  if (!deal.company_info) steps.push({ id: "company", text: "Vincule a empresa: é ela que vira Cliente e recebe o contrato na venda.", action: { label: "Vincular empresa", onClick: () => p.onLink("company") } });
  if (!deal.contact_info) steps.push({ id: "contact", text: "Vincule um contato para conversar por WhatsApp e e-mail daqui.", action: { label: "Vincular contato", onClick: () => p.onLink("contact") } });
  const last = pipeline.stages[pipeline.stages.length - 1];
  if (stage && last && stage.id === last.id && deal.qualification >= 4) steps.push({ id: "ready", text: "Última etapa e bem qualificada: hora de fechar! Registre a venda quando o cliente assinar." });
  if (!steps.length) steps.push({ id: "ok", text: "Tudo em dia por aqui. Siga a próxima tarefa e avance a etapa quando o cliente der o passo." });
  return steps;
}

/** Visão geral: indicadores, contexto, campos do funil, próximos passos, contato, empresa e próxima tarefa. */
export default function OverviewTab(props: OverviewTabProps) {
  const { deal, pipeline, tasks, now, basePath, busy, emailConfigured } = props;
  const stage = pipeline.stages.find((s) => s.id === deal.stage_id);
  const inStage = daysSince(deal.stage_entered_at, now);
  const idle = daysSince(deal.last_activity_at, now);
  const open = tasks.filter((t) => !t.done_at);
  const next = open[0] ?? null;
  const contact = deal.contact_info;
  const company = deal.company_info;
  const steps = recommendations(props);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <Card
          title="Detalhes da negociação"
          action={
            <Button variant="ghost" icon={FaPen} onClick={props.onEdit} className="h-9 px-3 text-[13px]">
              Editar
            </Button>
          }
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Valor da negociação" value={formatMoney(deal.value_cents)} strong />
            <Info label="Etapa atual" value={stage?.name ?? "—"} detail={inStage !== null ? `há ${plural(inStage, "dia", "dias")} nesta etapa` : undefined} />
            <Info label="Fechamento previsto" value={formatCalendarDate(deal.expected_close_date)} />
            <Info label="Lead chegou em" value={deal.lead_created_at ? formatDateTime(deal.lead_created_at) : "—"} detail={deal.lead_id ? undefined : "Negociação criada sem lead"} />
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-admin-text-description">Qualificação atual</dt>
              <dd>
                <Stars value={deal.qualification} onChange={busy ? undefined : props.onQualify} />
              </dd>
            </div>
            <Info label="Origem" value={dealOrigins.label(deal.origin)} detail={deal.source ? `Fonte: ${leadSources.label(deal.source)}` : undefined} />
            <Info label="Responsável" value={deal.owner_name ?? "—"} />
            <Info label="Criada em" value={formatDateTime(deal.created_at)} detail={deal.created_by_name ? `por ${deal.created_by_name}` : undefined} />
            <Info label="Última atividade" value={idle === null ? "—" : idle === 0 ? "Hoje" : `há ${plural(idle, "dia", "dias")}`} />
            {deal.interest_plan && <Info label="Plano de interesse" value={deal.interest_plan} />}
          </dl>
        </Card>

        <Card title="Contexto da negociação">
          {deal.context ? (
            <p className="whitespace-pre-line break-words text-sm leading-6 text-admin-drawer-notes">{deal.context}</p>
          ) : (
            <p className="text-sm text-admin-text-hint">
              Sem contexto ainda.{" "}
              <button type="button" onClick={props.onEdit} className="font-semibold text-admin-accent hover:underline">
                Escrever o contexto
              </button>{" "}
              (dor do cliente, prazos, quem decide...).
            </p>
          )}
        </Card>

        {pipeline.custom_fields.length > 0 && (
          <Card title={`Campos do funil “${pipeline.name}”`}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {pipeline.custom_fields.map((f) => {
                const v = deal.custom[f.id];
                const shown = v === null || v === undefined || v === "" ? "—" : f.type === "boolean" ? (v ? "Sim" : "Não") : f.type === "currency" ? formatMoney(Number(v)) : f.type === "date" ? formatCalendarDate(String(v)) : String(v);
                return <Info key={f.id} label={f.label} value={shown} />;
              })}
            </dl>
          </Card>
        )}

        <Card title="Próximos passos recomendados" icon={FaLightbulb}>
          <ul className="flex flex-col gap-2.5">
            {steps.map((s) => (
              <li
                key={s.id}
                className={`flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  s.tone === "danger" ? "bg-admin-deal-lost" : s.tone === "warning" ? "bg-admin-qual-hot" : "bg-admin-drawer-card"
                }`}
              >
                <span className={`text-sm font-medium leading-5 ${s.tone === "danger" ? "text-admin-deal-lost-text" : s.tone === "warning" ? "text-admin-qual-hot-text" : "text-admin-drawer-notes"}`}>{s.text}</span>
                {s.action && (
                  <button type="button" onClick={s.action.onClick} className="shrink-0 self-start rounded-lg bg-admin-card px-3 py-1.5 text-xs font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-badge sm:self-auto">
                    {s.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card title="Contato" icon={FaUser}>
          {contact ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text-primary">{contact.name}</p>
                  <p className="text-xs font-medium text-admin-text-description">{contact.role ?? "Cargo não informado"}</p>
                </div>
                <Link href={`${basePath}/contatos/${contact.id}`} aria-label={`Abrir contato ${contact.name}`} className="text-admin-accent hover:text-text-primary">
                  <FaArrowUpRightFromSquare aria-hidden className="h-3.5 w-3.5" />
                </Link>
              </div>
              <dl className="flex flex-col gap-3">
                <Info label="E-mail" value={contact.email ?? "—"} />
                <Info label="Telefone" value={formatPhone(contact.phone)} />
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={FaWhatsapp} onClick={props.onWhatsApp} disabled={!contact.phone && !company?.phone} className="h-10 px-3 text-[13px] !text-admin-whatsapp">
                  WhatsApp
                </Button>
                <Button variant="secondary" icon={FaEnvelope} onClick={() => props.onEmail("contact")} disabled={!contact.email} title={emailConfigured ? undefined : "Envio de e-mail não configurado"} className="h-10 px-3 text-[13px]">
                  E-mail
                </Button>
              </div>
            </div>
          ) : (
            <EmptyLink text="Nenhum contato vinculado." label="Vincular contato" onClick={() => props.onLink("contact")} />
          )}
        </Card>

        <Card title="Empresa" icon={FaBuilding}>
          {company ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text-primary">{company.name}</p>
                  {company.legal_name && <p className="truncate text-xs font-medium text-admin-text-description">{company.legal_name}</p>}
                </div>
                <Link href={`${basePath}/empresas/${company.id}`} aria-label={`Abrir empresa ${company.name}`} className="text-admin-accent hover:text-text-primary">
                  <FaArrowUpRightFromSquare aria-hidden className="h-3.5 w-3.5" />
                </Link>
              </div>
              <dl className="flex flex-col gap-3">
                <Info label="CNPJ" value={formatCnpj(company.cnpj)} />
                <Info label="Telefone" value={formatPhone(company.phone)} />
                <Info label="E-mail" value={company.email ?? "—"} />
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium text-admin-text-description">Website</dt>
                  <dd className="truncate text-sm font-medium text-admin-drawer-value">
                    {company.website ? (
                      <a href={/^https?:\/\//.test(company.website) ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-admin-accent hover:underline">
                        {company.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <Info label="Endereço" value={company.address ?? "—"} />
              </dl>
              <Button variant="secondary" icon={FaEnvelope} onClick={() => props.onEmail("company")} disabled={!company.email} className="h-10 text-[13px]">
                Enviar e-mail
              </Button>
            </div>
          ) : (
            <EmptyLink text="Nenhuma empresa vinculada. É ela que vira Cliente na venda." label="Vincular empresa" onClick={() => props.onLink("company")} />
          )}
        </Card>

        <Card title="Próxima tarefa" icon={FaCalendarCheck}>
          {next ? (
            <div className="flex flex-col gap-3">
              <div className={`flex flex-col gap-1 rounded-xl px-4 py-3 ${now !== null && Date.parse(next.due_at) < now ? "bg-admin-deal-lost" : "bg-admin-drawer-card"}`}>
                <p className="text-xs font-semibold text-admin-text-description">
                  {taskTypes.label(next.type)} · {formatDateTime(next.due_at)}
                  {now !== null && Date.parse(next.due_at) < now && <span className="text-admin-deal-lost-text"> · atrasada</span>}
                </p>
                <p className="text-sm font-semibold text-text-primary">{next.title}</p>
                <p className="text-xs text-admin-text-hint">Responsável: {next.assignee_name ?? "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={FaCheck} onClick={() => props.onTaskDone(next)} className="h-10 px-3 text-[13px]">
                  Concluir
                </Button>
                <Button variant="secondary" icon={FaPlus} onClick={props.onTask} className="h-10 px-3 text-[13px]">
                  Nova tarefa
                </Button>
              </div>
              {open.length > 1 && (
                <button type="button" onClick={() => props.onGo("tasks")} className="text-left text-xs font-semibold text-admin-accent hover:underline">
                  Ver todas ({open.length} abertas)
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-admin-text-hint">Nenhuma tarefa aberta.</p>
              <Button icon={FaPlus} onClick={props.onTask} className="h-10 text-[13px]">
                Criar tarefa
              </Button>
            </div>
          )}
        </Card>

        <button type="button" onClick={() => props.onGo("files")} className="flex items-center justify-between rounded-2xl bg-background-kpi px-5 py-4 text-left outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card">
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <FaFileArrowUp aria-hidden className="h-3.5 w-3.5 text-admin-accent" /> Arquivos e propostas
          </span>
          <span className="text-xs font-medium text-admin-text-description">{props.files.length ? `${props.files.length} anexado(s)` : "Nenhum ainda"}</span>
        </button>
        <p className="px-1 text-xs text-admin-text-hint">Criada em {formatDate(deal.created_at)} · {props.history.length} registros no histórico</p>
      </aside>
    </div>
  );
}

function Card({ title, icon: Icon, action, children }: { title: string; icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium text-text-primary">
          {Icon && <Icon aria-hidden className="h-3.5 w-3.5 text-admin-accent" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value, detail, strong }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium text-admin-text-description">{label}</dt>
      <dd className={`break-words ${strong ? "text-lg font-semibold text-text-primary" : "text-sm font-medium text-admin-drawer-value"}`}>{value}</dd>
      {detail && <dd className="text-xs text-admin-text-hint">{detail}</dd>}
    </div>
  );
}

function EmptyLink({ text, label, onClick }: { text: string; label: string; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-admin-text-hint">{text}</p>
      <Button variant="secondary" icon={FaPlus} onClick={onClick} className="h-10 text-[13px]">
        {label}
      </Button>
    </div>
  );
}

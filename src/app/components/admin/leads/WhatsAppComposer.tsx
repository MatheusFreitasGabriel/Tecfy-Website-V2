"use client";

import { useState } from "react";
import { FaGear, FaWhatsapp } from "react-icons/fa6";
import { fillTemplate, whatsappLink, type TemplateContext } from "@/lib/admin/crm/templates";
import type { MessageTemplate } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { Field, Select, TextArea } from "../form/Field";
import Modal from "../form/Modal";
import { formatPhone } from "./leadVisuals";

interface WhatsAppComposerProps {
  /** Telefones disponíveis (do lead e do contato), só dígitos. */
  phones: { label: string; digits: string }[];
  templates: MessageTemplate[];
  context: TemplateContext;
  onClose: () => void;
  onManageTemplates: () => void;
  /** Conversa aberta (a negociação registra no histórico). */
  onOpened?: (phone: string, message: string) => void;
}

/** Escreve (ou escolhe um modelo) e abre a conversa no WhatsApp já com a mensagem. */
export default function WhatsAppComposer({ phones, templates, context, onClose, onManageTemplates, onOpened }: WhatsAppComposerProps) {
  const [phone, setPhone] = useState(phones[0]?.digits ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [message, setMessage] = useState(() => (templates[0] ? fillTemplate(templates[0].body, context) : ""));

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) setMessage(fillTemplate(template.body, context));
  };

  const open = () => {
    if (!phone) return;
    window.open(whatsappLink(phone, message.trim()), "_blank", "noopener,noreferrer");
    onOpened?.(phone, message.trim());
    onClose();
  };

  return (
    <Modal
      title="Mensagem no WhatsApp"
      description="Escolha um modelo, ajuste o texto e abra a conversa já com a mensagem pronta."
      onClose={onClose}
      widthClass="max-w-[640px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" icon={FaGear} onClick={onManageTemplates}>
            Gerenciar modelos
          </Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button icon={FaWhatsapp} onClick={open} disabled={!phone || !message.trim()}>
              Abrir no WhatsApp
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Número">
            {(p) => (
              <Select
                {...p}
                options={phones.map((ph) => ({ value: ph.digits, label: `${formatPhone(ph.digits)} · ${ph.label}` }))}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
          <Field label="Modelo">
            {(p) => (
              <Select
                {...p}
                options={templates.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={templates.length ? undefined : "Nenhum modelo"}
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Mensagem" hint={`${message.length} caracteres. O WhatsApp abre numa nova aba; é só apertar enviar.`}>
          {(p) => <TextArea {...p} heightClass="h-48" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escreva a mensagem..." />}
        </Field>
      </div>
    </Modal>
  );
}

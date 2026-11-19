"use client";

import { useState } from "react";
import { FaUserCheck } from "react-icons/fa6";
import type { AdminUserOption } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { Field, Select } from "../form/Field";
import Modal from "../form/Modal";

interface AssignOwnerDialogProps {
  admins: AdminUserOption[];
  /** Responsável atual (pré-seleciona outro usuário). */
  currentOwnerUid: string | null;
  /** Quantos leads recebem o responsável. */
  count: number;
  busy: boolean;
  onConfirm: (uid: string) => void;
  onCancel: () => void;
}

/** Escolher quem vai cuidar do(s) lead(s). Fica registrado na timeline de cada um. */
export default function AssignOwnerDialog({ admins, currentOwnerUid, count, busy, onConfirm, onCancel }: AssignOwnerDialogProps) {
  const [uid, setUid] = useState(() => admins.find((a) => a.uid !== currentOwnerUid)?.uid ?? admins[0]?.uid ?? "");

  return (
    <Modal
      title={currentOwnerUid ? "Trocar responsável" : "Atribuir responsável"}
      description={count === 1 ? "Quem vai cuidar deste lead?" : `Quem vai cuidar destes ${count} leads?`}
      onClose={() => !busy && onCancel()}
      widthClass="max-w-[480px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button icon={FaUserCheck} onClick={() => uid && onConfirm(uid)} disabled={busy || !uid || uid === currentOwnerUid}>
            {busy ? "Salvando..." : "Atribuir"}
          </Button>
        </div>
      }
    >
      <Field label="Responsável" hint="A atribuição fica registrada na timeline do lead, com seu nome e o horário.">
        {(p) => (
          <Select
            {...p}
            options={admins.map((a) => ({ value: a.uid, label: a.uid === currentOwnerUid ? `${a.name} (atual)` : a.name }))}
            placeholder={admins.length ? undefined : "Nenhum usuário disponível"}
            value={uid}
            onChange={(e) => setUid(e.target.value)}
          />
        )}
      </Field>
    </Modal>
  );
}

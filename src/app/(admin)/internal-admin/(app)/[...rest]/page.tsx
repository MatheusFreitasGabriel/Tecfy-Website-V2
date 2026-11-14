import { notFound } from "next/navigation";

// Subcaminhos desconhecidos do painel (só alcançáveis com sessão válida) → 404.
export default function AdminCatchAll() {
  notFound();
}

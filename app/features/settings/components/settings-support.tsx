"use client";

import { Check, CheckCircle2, CircleAlert, UserRound, X, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { type SettingsRole, type StaffSettings } from "@/app/lib/settings";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";

export const inputClass =
  "mt-2 w-full min-w-0 max-w-full";
export const EMPTY_STAFF: StaffSettings = {
  identities: [],
  participants: [],
  restartRequired: false,
};

export function SectionLayout({ title, description, icon: Icon, action, children }: { title: string; description: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 p-4 py-4 shadow-sm sm:p-6 lg:p-7">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></span><div><h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>
        {action}
      </header>
      {children}
    </Card>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block min-w-0 max-w-full text-xs font-medium text-foreground">{label}{children}{hint ? <span className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}

export function Notice({ tone, title, children, onClose }: { tone: "success" | "warning" | "error"; title: string; children: ReactNode; onClose?: () => void }) {
  const classes = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-destructive/20 bg-destructive/5 text-destructive";
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return <div className={`rounded-xl border p-4 ${classes}`} role={tone === "error" ? "alert" : "status"}><div className="flex items-start gap-3"><Icon className="mt-0.5 shrink-0" size={18} /><div className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><div className="mt-1 text-sm leading-6 opacity-90">{children}</div></div>{onClose ? <Button aria-label="Fechar aviso" className="shrink-0" onClick={onClose} size="icon-sm" type="button" variant="ghost"><X size={14} /></Button> : null}</div></div>;
}

export function PermissionNotice() {
  return <div className="mb-5"><Notice tone="warning" title="Acesso somente leitura">Sua função não permite alterar esta seção. Solicite a mudança a um proprietário ou administrador.</Notice></div>;
}

export function EmptySettingsState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center"><span className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm"><Icon size={19} /></span><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 truncate text-sm font-semibold text-foreground">{typeof value === "number" ? new Intl.NumberFormat("pt-BR").format(value) : value}</dd></div>;
}

export function RoleBadge({ role }: { role: SettingsRole }) {
  return <Badge variant="secondary">{roleLabel(role)}</Badge>;
}

export function SecurityCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <Card className="gap-0 p-5 py-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></span><h3 className="mt-4 font-semibold text-foreground">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p></Card>;
}

export function PermissionRow({ active, label, description }: { active: boolean; label: string; description: string }) {
  return <div className={`flex gap-3 rounded-xl p-3 ${active ? "bg-primary/10" : "bg-muted/60"}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{active ? <Check size={12} /> : <UserRound size={11} />}</span><div><strong className={`text-sm ${active ? "text-primary" : "text-foreground"}`}>{label}{active ? " · sua função" : ""}</strong><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div></div>;
}

export function roleLabel(role: SettingsRole): string {
  return { owner: "Proprietário", admin: "Administrador", operator: "Operador", viewer: "Visualizador" }[role];
}

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "?").toLocaleUpperCase("pt-BR");
}

export function compactIdentity(value: string): string {
  return value.replace(/\D/g, "").replace(/^(\d+)@.+$/, "$1");
}

export function equalStringArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function formatDate(value: string, compact = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", compact ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
    minimumFractionDigits: unitIndex >= 3 ? 1 : 0,
  }).format(value)} ${units[unitIndex]}`;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Ocorreu um erro inesperado.";
}

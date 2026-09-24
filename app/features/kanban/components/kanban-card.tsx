import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock3,
  UserRound,
  XCircle,
} from "lucide-react";

import { PriorityPill } from "@/app/components/shared/status-pill";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { TicketAssigneeControl } from "@/app/components/shared/ticket-assignee-control";
import {
  getCategoryName,
  getClientName,
  getRequesterPresentation,
  getStoreName,
} from "@/app/lib/format";
import type { KanbanTab } from "@/app/lib/kanban-tabs";
import type { TicketAssignee, TicketSummary } from "@/app/lib/types";
import { cn } from "@/app/lib/utils";
import { getArchivedTicketOrigin } from "@/app/lib/archived-ticket-origin";
import {
  getKanbanTicketTimeLabel,
  getKanbanTicketTimestamp,
} from "../domain/kanban-ticket";

export function KanbanCard({
  ticket,
  mode,
  columnId,
  assigning,
  assignees,
  currentUserId,
  canAssign,
  onAssign,
  onOpen,
  onDragEnd,
  onDragStart,
}: {
  ticket: TicketSummary;
  mode: KanbanTab;
  columnId?: string;
  assigning: boolean;
  assignees: TicketAssignee[];
  currentUserId: string | null;
  canAssign: boolean;
  onAssign: (assigneeId: string | null) => Promise<boolean>;
  onOpen: () => void;
  onDragEnd?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const requester = getRequesterPresentation(ticket.requester);
  const archived = mode === "archived";
  const archivedOrigin = archived ? getArchivedTicketOrigin(ticket) : null;
  const draggable = Boolean(onDragStart) && !assigning;

  return (
    <article
      className={cn(
        "relative flex min-h-41 w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-primary/35 hover:shadow-md",
        assigning && "opacity-70",
      )}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        if ((event.target as Element).closest("[data-assignee-control]")) {
          event.preventDefault();
          return;
        }
        onDragStart?.(event);
      }}
    >
      <Button
        aria-label={`Abrir ticket #${ticket.number}`}
        className="flex w-full flex-1 cursor-pointer flex-col items-stretch justify-start whitespace-normal rounded-none p-3 text-left focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-wait"
        disabled={assigning}
        onClick={onOpen}
        size="unstyled"
        type="button"
        variant="unstyled"
      >
        <span className="mb-2 flex w-full min-w-0 flex-wrap items-center gap-1.5">
          <b className="shrink-0 text-xs font-semibold text-primary">#{ticket.number}</b>
          <PriorityPill priority={ticket.priority} />
          {archivedOrigin ? (
            <Badge
              className={cn(
                "h-5 border-0 px-2 text-xs font-medium",
                archivedOrigin === "cancelled"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {archivedOrigin === "cancelled" ? "Cancelado" : "Resolvido"}
            </Badge>
          ) : null}
          <time
            className={cn(
              "flex min-w-0 items-center gap-1 text-xs leading-tight text-muted-foreground",
              archived
                ? "basis-full justify-start text-left"
                : "ml-auto justify-end text-right",
            )}
            dateTime={getKanbanTicketTimestamp(ticket, mode, columnId)}
          >
            <Clock3 size={12} /> {getKanbanTicketTimeLabel(ticket, mode, columnId)}
          </time>
        </span>
        <strong className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
          {ticket.title}
        </strong>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {getClientName(ticket)}
          {getStoreName(ticket) ? ` · ${getStoreName(ticket)}` : ""}
        </p>
        {requester ? (
          <span
            className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-tight text-muted-foreground"
            title={requester.compact}
          >
            <UserRound className="shrink-0 text-primary/80" size={12} />
            <span className="min-w-0 flex-1 basis-25 truncate font-medium">
              {requester.name}
            </span>
            {requester.phone && requester.phone !== requester.name ? (
              <small className="min-w-0 truncate text-xs text-muted-foreground/80">
                {requester.phone}
              </small>
            ) : null}
          </span>
        ) : null}
        <span className="mt-2.5 flex flex-wrap gap-1">
          {ticket.assignmentPending ? (
            <Badge className="h-5 gap-1 border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">
              <Clock3 size={11} /> Aguardando responsável
            </Badge>
          ) : null}
          {ticket.categories.slice(0, 2).map((category) => (
            <Badge className="h-5 px-2 text-xs font-medium not-italic" key={category.id} variant="secondary">
              {getCategoryName(category)}
            </Badge>
          ))}
          {ticket.needsReview ? (
            <Badge className="h-5 px-2 text-xs font-medium not-italic" variant="outline">
              Revisar
            </Badge>
          ) : null}
        </span>
      </Button>

      <div className="grid gap-2 px-3 pb-3">
        <div className="border-t border-border/70 pt-2.5" data-assignee-control>
          <TicketAssigneeControl
            assignee={ticket.assignee}
            assignees={assignees}
            canManage={canAssign}
            compact
            currentUserId={currentUserId}
            disabled={assigning}
            onChange={onAssign}
          />
        </div>
        <Button
          className="h-7 w-full justify-start px-0 text-xs font-medium text-muted-foreground"
          onClick={onOpen}
          size="sm"
          type="button"
          variant="ghost"
        >
          {archived ? (
            <>
              {archivedOrigin === "cancelled"
                ? "Cancelado · Arquivado"
                : "Resolvido · Arquivado"}
              <Archive className="ml-auto text-primary" size={14} />
            </>
          ) : ticket.status === "resolved" ? (
            <>
              Solução registrada
              <CheckCircle2 className="ml-auto text-primary" size={14} />
            </>
          ) : ticket.status === "cancelled" ? (
            <>
              Ticket cancelado
              <XCircle className="ml-auto text-rose-600" size={14} />
            </>
          ) : (
            <>
              Abrir contexto
              <ArrowRight className="ml-auto text-primary" size={14} />
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

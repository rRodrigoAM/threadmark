"use client";

import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { NotificationPreview } from "@/app/features/notifications/components/notification-preview";
import { NotificationLivePreview } from "@/app/features/notifications/components/notification-live-preview";
import type { NotificationDto } from "@/shared/contracts";

const demoNotifications: NotificationDto[] = [
  {
    id: "demo-1",
    title: "Ticket Concluído #572 arquivado!",
    body: "Resultados da semana carregados no dashboard · Atenas Performance & Adstart. O aviso flutuante fecha ao abrir as notificações.",
    targetUrl: null,
    sourceType: "automation",
    sourceId: "demo-automation",
    tone: "info",
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Ticket Concluído #575 arquivado!",
    body: "Ajustar feed XML da Secret Glam após migração para Woo · Rovixtex & Adstart.",
    targetUrl: null,
    sourceType: "automation",
    sourceId: "demo-automation-2",
    tone: "info",
    readAt: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "demo-3",
    title: "Ticket Concluído #446 arquivado!",
    body: "Revisar e melhorar todas as documentações do Intercom · Adstart DEV.",
    targetUrl: null,
    sourceType: "automation",
    sourceId: "demo-automation-3",
    tone: "info",
    readAt: null,
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  },
];

export default function NotificationDemoPage() {
  const [queue, setQueue] = useState(demoNotifications);
  const [unread, setUnread] = useState(demoNotifications.length);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <div>
          <p className="text-sm font-semibold">Threadmark</p>
          <p className="text-xs text-muted-foreground">Demonstração local de notificações</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
            Dados fictícios · sem login
          </span>
          <NotificationPreview
            onOpenAll={() => undefined}
            onOpenPreview={() => setQueue([])}
            onOpenTarget={() => undefined}
            onUnreadChange={setUnread}
            unread={unread}
          />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Teste de notificações</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          O aviso flutuante está visível. Clique no sino: o painel de notificações
          abrirá e todos os avisos flutuantes serão fechados, sem marcar nada como lido.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={() => setQueue(demoNotifications)}
            type="button"
            variant="outline"
          >
            Mostrar aviso novamente
          </Button>
          <span className="text-xs text-muted-foreground">3 notificações fictícias não lidas</span>
        </div>
      </section>

      {queue[0] ? (
        <NotificationLivePreview
          notification={queue[0]}
          onDismiss={() => setQueue([])}
          onOpen={() => setQueue([])}
          pendingCount={queue.length - 1}
        />
      ) : null}
    </main>
  );
}

import { z } from "zod";

export const triageAnalysisSchema = z.object({
  groups: z
    .array(
      z
        .object({
          messageIds: z.array(z.string().trim().min(1)).min(1).max(50),
          contextMessageIds: z.array(z.string().trim().min(1)).max(50).default([]),
          kind: z.enum([
            "demand",
            "uncertain",
            "continuation",
            "information",
            "social",
          ]),
          suggestedAction: z.enum(["create", "attach", "ignore", "wait"]),
          relatedTicketId: z.string().trim().min(1).nullable(),
          relatedSuggestionId: z.string().trim().min(1).nullable(),
          title: z.string().trim().min(1).max(200),
          summary: z.string().trim().min(1).max(4_000),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          affectedEcommerce: z.string().trim().min(1).max(500).nullable(),
          categories: z.object({
            contactReason: z.array(z.string().trim()).max(1),
            productArea: z.array(z.string().trim()).max(1),
            platform: z.array(z.string().trim()).max(3),
            symptom: z.array(z.string().trim()).max(1),
          }),
          reason: z.string().trim().min(1).max(1_000),
          confidence: z.number().min(0).max(1),
        })
        .superRefine((decision, context) => {
          if (
            decision.suggestedAction === "attach" &&
            !decision.relatedTicketId &&
            !decision.relatedSuggestionId
          ) {
            context.addIssue({
              code: "custom",
              path: ["relatedTicketId"],
              message: "attach exige um ticket ou uma sugestão pendente relacionada",
            });
          }
          if (decision.suggestedAction !== "attach" && decision.relatedTicketId) {
            context.addIssue({
              code: "custom",
              path: ["relatedTicketId"],
              message: "somente attach permite ticket relacionado",
            });
          }
          if (decision.relatedTicketId && decision.relatedSuggestionId) {
            context.addIssue({
              code: "custom",
              path: ["relatedSuggestionId"],
              message: "ticket e sugestão relacionada são mutuamente exclusivos",
            });
          }
          if (
            decision.suggestedAction === "ignore" &&
            decision.kind !== "social" &&
            decision.kind !== "information"
          ) {
            context.addIssue({
              code: "custom",
              path: ["suggestedAction"],
              message: "somente conteúdo social ou informativo pode ser ignorado",
            });
          }
          if (
            decision.suggestedAction === "ignore" &&
            Object.values(decision.categories).some((values) => values.length)
          ) {
            context.addIssue({
              code: "custom",
              path: ["categories"],
              message: "conteúdo ignorado não recebe categorias",
            });
          }
          if (decision.suggestedAction === "ignore" && decision.relatedSuggestionId) {
            context.addIssue({
              code: "custom",
              path: ["relatedSuggestionId"],
              message: "ignore não pode alterar uma sugestão pendente",
            });
          }
          if (
            (decision.suggestedAction === "ignore" || decision.suggestedAction === "wait") &&
            decision.contextMessageIds.length
          ) {
            context.addIssue({
              code: "custom",
              path: ["contextMessageIds"],
              message: "ignore e wait não recebem contexto interno associado",
            });
          }
          if (decision.suggestedAction === "wait" && decision.kind !== "uncertain") {
            context.addIssue({
              code: "custom",
              path: ["kind"],
              message: "wait exige kind uncertain",
            });
          }
          if (
            decision.suggestedAction === "wait" &&
            Object.values(decision.categories).some((values) => values.length)
          ) {
            context.addIssue({
              code: "custom",
              path: ["categories"],
              message: "wait não recebe categorias",
            });
          }
          if (
            decision.suggestedAction === "wait" &&
            (decision.relatedTicketId || decision.relatedSuggestionId)
          ) {
            context.addIssue({
              code: "custom",
              path: ["relatedSuggestionId"],
              message: "wait não permite ticket nem sugestão relacionada",
            });
          }
        }),
    )
    .min(1)
    .max(50),
});

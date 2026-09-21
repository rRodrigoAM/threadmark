export type ParticipantRole = "external" | "staff" | "self" | "unknown";

export interface AnalysisMessage {
  id: string;
  author: string;
  role: ParticipantRole;
  timestampUtc: string;
  text: string | null;
  attachments: Array<{
    id?: string;
    kind: "image" | "document" | "video" | "audio" | "other";
    fileName: string | null;
    mimeType?: string | null;
    localPath?: string | null;
    extractedText: string | null;
  }>;
  quotedMessageId: string | null;
}

export interface AnalysisCategoryCatalog {
  contactReason: string[];
  productArea: string[];
  platform: string[];
  symptom: string[];
}

export interface TriageAnalysisInput {
  accountName: string;
  accountType: "agency" | "ecommerce" | "unknown";
  groupName: string;
  knownEcommerces: string[];
  categoryCatalog?: AnalysisCategoryCatalog;
  candidateMessageIds: string[];
  messages: AnalysisMessage[];
  openTickets: Array<{
    id: string;
    title: string;
    summary: string;
    status: string;
  }>;
  pendingSuggestions: Array<{
    id: string;
    title: string;
    summary: string;
    suggestedAction: "create" | "attach" | "ignore";
    suggestedTicketId: string | null;
    lastMessageAt: string;
  }>;
}

export interface TriageCategoryProposal {
  contactReason: string[];
  productArea: string[];
  platform: string[];
  symptom: string[];
}

export interface TriageAnalysisDecision {
  messageIds: string[];
  contextMessageIds?: string[];
  kind: "demand" | "uncertain" | "continuation" | "information" | "social";
  suggestedAction: "create" | "attach" | "ignore" | "wait";
  relatedTicketId: string | null;
  relatedSuggestionId: string | null;
  title: string;
  summary: string;
  priority?: "low" | "normal" | "high" | "urgent";
  affectedEcommerce: string | null;
  categories: TriageCategoryProposal;
  reason: string;
  confidence: number;
}

export interface TriageAnalysis {
  groups: TriageAnalysisDecision[];
}

export interface SupportAnalysis {
  createTicket: boolean;
  relation:
    | "new"
    | "continuation"
    | "possible_reopen"
    | "informational"
    | "social"
    | "uncertain";
  categories: TriageCategoryProposal;
}

/* eslint-disable */
/**
 * Generated Convex server wrappers
 */
import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { GenericId } from "convex/values";

export type TableNames =
  | "patients"
  | "claims"
  | "clinicalEvidences"
  | "appeals"
  | "emailThreads"
  | "emailMessages"
  | "appealAuditLogs";

export type Id<TableName extends TableNames | "_storage"> = GenericId<TableName>;

export interface PatientDoc {
  _id: Id<"patients">;
  _creationTime: number;
  name: string;
  email: string;
  memberId: string;
  groupNumber?: string;
  insurancePayer: string;
  state: string;
  createdAt: number;
}

export interface ClaimDoc {
  _id: Id<"claims">;
  _creationTime: number;
  patientId: Id<"patients">;
  claimNumber: string;
  serviceDate: string;
  providerName: string;
  deniedAmount: number;
  patientOwedAmount: number;
  cptCodes: string[];
  icd10Codes: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
  status: string;
  statutoryDeadline: number;
  daysRemaining: number;
  overturnProbabilityScore?: number;
  riskLevel?: string;
  assignedAgentEmail: string;
  denialLetterStorageId?: Id<"_storage">;
  createdAt: number;
  updatedAt: number;
}

export interface ClinicalEvidenceDoc {
  _id: Id<"clinicalEvidences">;
  _creationTime: number;
  claimId: Id<"claims">;
  sourceType: string;
  title: string;
  sourceUrl?: string;
  citationClause: string;
  extractedEvidenceMarkdown: string;
  relevanceScore: number;
  createdAt: number;
}

export interface AppealDoc {
  _id: Id<"appeals">;
  _creationTime: number;
  claimId: Id<"claims">;
  version: number;
  appealLevel: string;
  executiveSummary: string;
  medicalNecessityArguments: string;
  legalCitations: string;
  fullAppealMarkdown: string;
  pdfExportStorageId?: Id<"_storage">;
  lastEditedBy: string;
  updatedAt: number;
}

export interface EmailThreadDoc {
  _id: Id<"emailThreads">;
  _creationTime: number;
  claimId: Id<"claims">;
  agentEmail: string;
  payerEmail: string;
  subject: string;
  status: string;
  lastMessageAt: number;
}

export interface EmailMessageDoc {
  _id: Id<"emailMessages">;
  _creationTime: number;
  threadId: Id<"emailThreads">;
  claimId: Id<"claims">;
  direction: string;
  sender: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  hasAttachments: boolean;
  receivedAt: number;
}

export interface AppealAuditLogDoc {
  _id: Id<"appealAuditLogs">;
  _creationTime: number;
  claimId: Id<"claims">;
  eventType: string;
  actor: string;
  details: string;
  timestamp: number;
}

export type Doc<TableName extends TableNames> = TableName extends "patients"
  ? PatientDoc
  : TableName extends "claims"
  ? ClaimDoc
  : TableName extends "clinicalEvidences"
  ? ClinicalEvidenceDoc
  : TableName extends "appeals"
  ? AppealDoc
  : TableName extends "emailThreads"
  ? EmailThreadDoc
  : TableName extends "emailMessages"
  ? EmailMessageDoc
  : TableName extends "appealAuditLogs"
  ? AppealAuditLogDoc
  : any;

export const query = queryGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: QueryCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const mutation = mutationGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: MutationCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const action = actionGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: ActionCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const internalQuery = internalQueryGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: QueryCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const internalMutation = internalMutationGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: MutationCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const internalAction = internalActionGeneric as unknown as <Args extends Record<string, any>, Output>(
  options: {
    args?: any;
    handler: (ctx: ActionCtx, args: Args) => Promise<Output> | Output;
  }
) => any;

export const httpAction = httpActionGeneric;

export type QueryCtx = GenericQueryCtx<any>;
export type MutationCtx = GenericMutationCtx<any>;
export type ActionCtx = GenericActionCtx<any>;

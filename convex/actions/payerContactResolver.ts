"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { createStructuredCompletion } from "../lib/openai";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";

const firecrawl = new FirecrawlClient(components.firecrawl);

const CONTACT_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    officialAppealsEmail: {
      type: "string",
      description:
        "Official public email exclusively dedicated to receiving formal claim appeals or grievance submissions. Return empty string if not found or if payer rejects email appeals.",
    },
    intakePortalUrl: {
      type: "string",
      description:
        "Official URL of the payer's online appeals/grievance/claims portal. Return empty string if not found.",
    },
    portalName: {
      type: "string",
      description:
        "Human-readable name of the portal. Return empty string if not found.",
    },
    appealsFax: {
      type: "string",
      description:
        "Official fax number dedicated to receiving appeals. Return empty string if not found.",
    },
    statutoryPoBox: {
      type: "string",
      description:
        "Physical mailing address or P.O. Box for formal written appeals. Return empty string if not found.",
    },
    ediPayerId: {
      type: "string",
      description:
        "Electronic Data Interchange (EDI) Payer ID if known. Return empty string if not found.",
    },
    tollFreeHelpline: {
      type: "string",
      description:
        "Customer service or appeals department telephone helpline. Return empty string if not found.",
    },
    isVerified: {
      type: "boolean",
      description:
        "True ONLY if authentic, verified contact information was identified from authoritative search results.",
    },
    submissionPolicyNote: {
      type: "string",
      description:
        "Brief note explaining the payer's official submission requirements based on search results.",
    },
    source: {
      type: "string",
      description:
        "'firecrawl_live' if discovered from web search, 'preset' if preset directory, or 'unresolved' if not found.",
    },
  },
  required: [
    "officialAppealsEmail",
    "intakePortalUrl",
    "portalName",
    "appealsFax",
    "statutoryPoBox",
    "ediPayerId",
    "tollFreeHelpline",
    "isVerified",
    "submissionPolicyNote",
    "source",
  ],
  additionalProperties: false,
};

export interface ResolvedPayerContact {
  officialAppealsEmail?: string;
  intakePortalUrl?: string;
  portalName?: string;
  appealsFax?: string;
  statutoryPoBox?: string;
  ediPayerId?: string;
  tollFreeHelpline?: string;
  isVerified: boolean;
  submissionPolicyNote?: string;
  source?: string;
}

/**
 * Autonomous Payer Contact Resolver Action:
 * Discovers real insurer grievance, claims, and appeals intake gateways
 * using Firecrawl Web Search + LLM extraction for any domestic or international insurer.
 */
export const resolvePayerGateway = action({
  args: {
    claimId: v.id("claims"),
    payerName: v.optional(v.string()),
    forceWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ResolvedPayerContact> => {
    // 1. Fetch claim context
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    const payer = args.payerName || claim.patient?.insurancePayer || "Health Insurer";
    const cleanName = payer.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 2. Check if known US major payer and web search not forced
    const PRESET_PAYERS: Record<string, ResolvedPayerContact> = {
      molina: {
        officialAppealsEmail: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
        intakePortalUrl: "https://member.molinahealthcare.com",
        portalName: "MyMolina Grievance & Appeals Gateway",
        appealsFax: "1-877-508-5748",
        statutoryPoBox: "Molina Healthcare of Florida, Grievance and Appeals Dept., P.O. Box 521838, Longwood, FL 32752",
        ediPayerId: "51062",
        tollFreeHelpline: "1-888-560-5716",
        isVerified: true,
        submissionPolicyNote: "Molina Healthcare accepts formal written appeals and grievance submissions directly via its dedicated state appeals email (MFLGrievanceandAppealsDepartment@MolinaHealthcare.com), MyMolina portal, or appellate fax.",
        source: "preset",
      },
      geoblue: {
        officialAppealsEmail: "claims@geo-blue.com",
        intakePortalUrl: "https://www.geo-blue.com",
        portalName: "GeoBlue Member & Claims Portal",
        appealsFax: "1-610-482-9623",
        statutoryPoBox: "GeoBlue Claims Appeals Unit, One Radnor Corporate Center, Suite 100, Radnor, PA 19087",
        ediPayerId: "GEO01",
        tollFreeHelpline: "1-855-282-3517",
        isVerified: true,
        submissionPolicyNote: "GeoBlue (Blue Cross Blue Shield Global licensee) accepts direct claim disputes, appeal packets, and clinical records via its official appeals email (claims@geo-blue.com) or portal.",
        source: "preset",
      },
      bcbsglobal: {
        officialAppealsEmail: "claims@bcbsglobalcore.com",
        intakePortalUrl: "https://www.bcbsglobalcore.com",
        portalName: "BCBS Global Core Service Center Portal",
        appealsFax: "1-804-673-1179",
        statutoryPoBox: "BCBS Global Core Service Center, P.O. Box 2048, Richmond, VA 23218-2048",
        ediPayerId: "BCBSG",
        tollFreeHelpline: "1-800-810-2583",
        isVerified: true,
        submissionPolicyNote: "BCBS Global Core explicitly accepts itemized international medical claim disputes and formal appeal submissions via its dedicated claims email (claims@bcbsglobalcore.com).",
        source: "preset",
      },
      unitedhealthcare: {
        intakePortalUrl: "https://www.uhcprovider.com/en/claims-payments-billing/appeals.html",
        portalName: "UHC Provider Appeals & Grievance Portal",
        appealsFax: "1-855-899-7400",
        statutoryPoBox: "P.O. Box 30432, Salt Lake City, UT 84130-0432",
        ediPayerId: "87726",
        tollFreeHelpline: "1-800-842-1609",
        isVerified: true,
        submissionPolicyNote: "UHC mandates formal appeals via UHCprovider.com portal, fax, or certified mail. Unencrypted emails are rejected by payer filters.",
        source: "preset",
      },
      aetna: {
        intakePortalUrl: "",
        portalName: "",
        appealsFax: "1-859-455-8650",
        statutoryPoBox: "Aetna Provider Resolution Team, P.O. Box 14020, Lexington, KY 40512",
        ediPayerId: "60054",
        tollFreeHelpline: "1-800-624-0756",
        isVerified: true,
        submissionPolicyNote: "Aetna does not accept appeals via portal or email. Formal submissions must be sent via Appellate Fax (1-859-455-8650) or Mail to Lexington, KY (P.O. Box 14020).",
        source: "preset",
      },
      cigna: {
        intakePortalUrl: "https://www.cigna.com/health-care-providers/coverage-and-claims/appeals-disputes",
        portalName: "CignaforHCP / myCigna Appeals Portal",
        appealsFax: "1-877-804-1679",
        statutoryPoBox: "Cigna National Appeals, P.O. Box 188062, Chattanooga, TN 37422",
        ediPayerId: "62308",
        tollFreeHelpline: "1-800-882-4462",
        isVerified: true,
        submissionPolicyNote: "Cigna accepts appeals via CignaforHCP / myCigna portal, appellate fax (1-877-804-1679), or P.O. Box in Chattanooga, TN. Standard medical emails are strictly rejected.",
        source: "preset",
      },
      bcbs: {
        intakePortalUrl: "https://providers.anthem.com/california-provider/contact-us",
        portalName: "Anthem Provider Portal (Availity Essentials)",
        appealsFax: "1-866-587-3316",
        statutoryPoBox: "Anthem Grievances and Appeals, P.O. Box 1407, Church Street Station, New York, NY 10008",
        ediPayerId: "47198",
        tollFreeHelpline: "1-800-676-2583",
        isVerified: true,
        submissionPolicyNote: "Anthem/Elevance requires appeals through the Availity portal or appellate fax (1-866-587-3316). Standard commercial plans reject email.",
        source: "preset",
      },
      humana: {
        intakePortalUrl: "https://resolutions.humana.com/",
        portalName: "Humana Resolutions Portal",
        appealsFax: "1-800-949-2961",
        statutoryPoBox: "Humana Grievances and Appeals, P.O. Box 14165, Lexington, KY 40512",
        ediPayerId: "61101",
        tollFreeHelpline: "1-800-448-6262",
        isVerified: true,
        submissionPolicyNote: "Upload documentation directly through the Humana Resolutions Portal (resolutions.humana.com) or submit via Medical Appeals Fax (1-800-949-2961).",
        source: "preset",
      },
      kaiser: {
        intakePortalUrl: "https://healthy.kaiserpermanente.org/community-providers/permanente-advantage/contact-us",
        portalName: "Kaiser Community Provider Portal",
        appealsFax: "1-626-405-3039",
        statutoryPoBox: "Kaiser Permanente Appeals Department, P.O. Box 30766, Salt Lake City, UT 84130",
        ediPayerId: "94144",
        tollFreeHelpline: "1-800-464-4000",
        isVerified: true,
        submissionPolicyNote: "Kaiser central intake accepts submissions through the Community Provider Portal, Fax (1-626-405-3039), or Salt Lake City PO Box.",
        source: "preset",
      },
    };

    let matchedPresetKey: string | null = null;
    if (!args.forceWebSearch) {
      for (const [key] of Object.entries(PRESET_PAYERS)) {
        if (cleanName.includes(key)) {
          matchedPresetKey = key;
          break;
        }
      }
    }

    let resolvedContact: ResolvedPayerContact;

    if (matchedPresetKey) {
      resolvedContact = PRESET_PAYERS[matchedPresetKey];
    } else {
      // 3. Dynamic Discovery via Firecrawl Search + LLM
      let webSearchContext = "";

      try {
        const searchQuery = `"${payer}" official appeals portal or fax or claims or "khiếu nại" contact`;
        const searchData = await firecrawl.search(ctx, searchQuery, {
          limit: 3,
          scrapeOptions: { formats: ["markdown"] },
        });

        const results = searchData?.web || [];
        webSearchContext = (Array.isArray(results) ? results : [])
          .map((r: { title?: string; url?: string; markdown?: string; description?: string }) => `Title: ${r.title || "Payer Portal"}\nURL: ${r.url || ""}\nContent: ${(r.markdown || r.description || "").slice(0, 1500)}`)
          .join("\n\n---\n\n");
      } catch (crawlErr) {
        console.warn("Firecrawl search error, continuing to AI synthesis:", crawlErr);
      }

      // 4. Use LLM to extract verified contact details
      const systemPrompt = `You are ClaimHero's Payer Intake Intelligence Agent.
Your task is to extract authentic, official appellate, grievance, claims, or customer care intake gateway details for the specified health insurer or insurance company.

CRITICAL INTEGRITY RULES:
1. NEVER guess, synthesize, or hallucinate contact information (e.g. do NOT invent fake domains, fake 555 numbers, fake EDI IDs like EDI-AUTO, or fake emails).
2. Most major health insurers strictly reject appeal submissions via unencrypted public email due to HIPAA compliance and mandate online provider portals, appellate faxes, or certified postal mail.
3. ONLY return an officialAppealsEmail if a genuine, publicly documented email address explicitly intended for claim appeals/disputes or customer grievances was found in the search results.
4. If any field (email, portal URL, portal name, fax, PO Box, EDI ID, helpline) is not found in the search evidence, return an empty string "".
5. Set isVerified to true ONLY if authentic, verified contact information was identified in the evidence.`;

      const userPrompt = `Insurer Name: ${payer}
Patient State / Jurisdiction: ${claim.patient?.state || "National"}
Web Search Evidence from Firecrawl:
${webSearchContext || "No live search results available."}

Extract the official appeals/grievance/claims intake gateway details for ${payer}.`;

      try {
        const aiExtraction = await createStructuredCompletion<ResolvedPayerContact>({
          systemPrompt,
          userPrompt,
          schema: CONTACT_EXTRACTION_SCHEMA,
          schemaName: "ResolvedPayerContact",
          temperature: 0.1,
        });

        const cleanField = (val?: string) => {
          const trimmed = val?.trim();
          if (!trimmed) return undefined;
          if (trimmed.includes("555-01") || trimmed.includes("EDI-AUTO") || trimmed.includes("EDI-UNKNOWN")) {
            return undefined;
          }
          return trimmed;
        };

        const extractedEmail = cleanField(aiExtraction.officialAppealsEmail);
        const intakePortalUrl = cleanField(aiExtraction.intakePortalUrl);
        const portalName = cleanField(aiExtraction.portalName);
        const appealsFax = cleanField(aiExtraction.appealsFax);
        const statutoryPoBox = cleanField(aiExtraction.statutoryPoBox);
        const ediPayerId = cleanField(aiExtraction.ediPayerId);
        const tollFreeHelpline = cleanField(aiExtraction.tollFreeHelpline);
        const submissionPolicyNote = cleanField(aiExtraction.submissionPolicyNote);

        const hasAnyContact = Boolean(
          extractedEmail || intakePortalUrl || appealsFax || statutoryPoBox
        );

        resolvedContact = {
          officialAppealsEmail: extractedEmail && extractedEmail.includes("@") ? extractedEmail : undefined,
          intakePortalUrl:
            intakePortalUrl && (intakePortalUrl.startsWith("http://") || intakePortalUrl.startsWith("https://"))
              ? intakePortalUrl
              : undefined,
          portalName: portalName || (intakePortalUrl ? `${payer} Appeals Portal` : undefined),
          appealsFax,
          statutoryPoBox,
          ediPayerId,
          tollFreeHelpline,
          isVerified: Boolean(aiExtraction.isVerified && hasAnyContact),
          submissionPolicyNote:
            submissionPolicyNote ||
            (hasAnyContact
              ? "Submissions accepted via official payer channels."
              : "No verified electronic gateway found in public index. Submit via address on denial notice."),
          source: hasAnyContact ? (webSearchContext ? "firecrawl_live" : "ai_knowledge") : "unresolved",
        };
      } catch {
        resolvedContact = {
          officialAppealsEmail: undefined,
          intakePortalUrl: undefined,
          portalName: undefined,
          appealsFax: undefined,
          statutoryPoBox: undefined,
          ediPayerId: undefined,
          tollFreeHelpline: undefined,
          isVerified: false,
          submissionPolicyNote:
            "Payer gateway could not be verified automatically. Consult the denial notice for appellate filing instructions.",
          source: "unresolved",
        };
      }
    }

    // 5. Persist the discovered contact to the claim record
    await ctx.runMutation(internal.claims.updatePayerContactInternal, {
      claimId: args.claimId,
      payerContact: resolvedContact,
    });

    // 6. Record audit log
    await ctx.runMutation(internal.auditLogs.logEventInternal, {
      claimId: args.claimId,
      eventType: "policy_crawled",
      actor: resolvedContact.source === "firecrawl_live" ? "Firecrawl Web Crawler" : "Payer Gateway Resolver",
      details: resolvedContact.isVerified
        ? `Resolved official appeals gateway for ${payer}: ${resolvedContact.officialAppealsEmail || resolvedContact.portalName || resolvedContact.appealsFax || "Appellate Gateway"} (Source: ${resolvedContact.source}).`
        : `No verified public appeals gateway found for ${payer}; manual filing verification required.`,
    });

    return resolvedContact;
  },
});

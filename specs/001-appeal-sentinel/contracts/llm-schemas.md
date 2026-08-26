# LLM Structured Output Contracts: OpenAI (ClaimHero)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Ready for Implementation  

All OpenAI completions utilize `response_format: { type: "json_schema", json_schema: { ... } }` to ensure strict type compliance.

---

## 1. Denial Letter Optical Extraction Schema (`DenialExtractionResult`)

Used by `actions/opticalParser.ts` to extract structured fields from raw OCR text or EOB documents.

```json
{
  "name": "DenialExtractionResult",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "claimNumber": { "type": "string" },
      "patientName": { "type": "string" },
      "memberId": { "type": "string" },
      "insurancePayer": { "type": "string" },
      "serviceDate": { "type": "string" },
      "providerName": { "type": "string" },
      "deniedAmount": { "type": "number" },
      "patientOwedAmount": { "type": "number" },
      "cptCodes": {
        "type": "array",
        "items": { "type": "string" }
      },
      "icd10Codes": {
        "type": "array",
        "items": { "type": "string" }
      },
      "denialReasonCode": { "type": "string" },
      "denialReasonDescription": { "type": "string" },
      "appealFilingDeadlineDays": { "type": "number" }
    },
    "required": [
      "claimNumber",
      "patientName",
      "memberId",
      "insurancePayer",
      "serviceDate",
      "providerName",
      "deniedAmount",
      "patientOwedAmount",
      "cptCodes",
      "icd10Codes",
      "denialReasonCode",
      "denialReasonDescription",
      "appealFilingDeadlineDays"
    ],
    "additionalProperties": false
  }
}
```

---

## 2. Overturn Probability & Risk Analysis Schema (`OverturnScoringResult`)

Used by `actions/precedentMatcher.ts` to compute the win score and identify policy contradictions.

```json
{
  "name": "OverturnScoringResult",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "overturnProbabilityScore": { "type": "number" },
      "riskLevel": {
        "type": "string",
        "enum": ["high_confidence", "moderate", "complex_litigation"]
      },
      "keyPolicyContradictions": {
        "type": "array",
        "items": { "type": "string" }
      },
      "winningPrecedentSummary": { "type": "string" },
      "suggestedAppealLevel": {
        "type": "string",
        "enum": ["level_1_internal", "level_2_grievance", "level_3_external_state_review"]
      }
    },
    "required": [
      "overturnProbabilityScore",
      "riskLevel",
      "keyPolicyContradictions",
      "winningPrecedentSummary",
      "suggestedAppealLevel"
    ],
    "additionalProperties": false
  }
}
```

---

## 3. Cited Appeal Brief Synthesis Schema (`AppealBriefSynthesisResult`)

Used by `actions/appealSynthesizer.ts` to generate formal legal & clinical appeal briefs.

```json
{
  "name": "AppealBriefSynthesisResult",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "executiveSummary": { "type": "string" },
      "statutoryRightsNotice": { "type": "string" },
      "medicalNecessityArguments": { "type": "string" },
      "policyCitations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": { "type": "string" },
            "clause": { "type": "string" },
            "quote": { "type": "string" }
          },
          "required": ["source", "clause", "quote"],
          "additionalProperties": false
        }
      },
      "formalDemandForPayment": { "type": "string" },
      "fullAppealMarkdown": { "type": "string" }
    },
    "required": [
      "executiveSummary",
      "statutoryRightsNotice",
      "medicalNecessityArguments",
      "policyCitations",
      "formalDemandForPayment",
      "fullAppealMarkdown"
    ],
    "additionalProperties": false
  }
}
```

# Webhook Contract: AgentMail Inbound Event Stream

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Ready for Implementation  

---

## 1. Webhook Endpoint Specification

- **Method**: `POST`
- **Path**: `/http/agentmail-inbound`
- **Headers**:
  - `Content-Type: application/json`
  - `AgentMail-Signature: <hmac-signature>` (for authenticity verification)

---

## 2. Inbound Message Payload Example

```json
{
  "event": "message.received",
  "data": {
    "message_id": "msg_9841029384",
    "inbox_id": "inbox_appeal_8942",
    "inbox_address": "appeal-claim-8942@claimhero.agentmail.com",
    "sender": "grievances@uhc.com",
    "recipient": "appeal-claim-8942@claimhero.agentmail.com",
    "subject": "RE: URGENT APPEAL - Claim CLM-8942-UHC - Determination Notice",
    "timestamp": 1756209420000,
    "body_text": "We have received your Level 1 Appeal dossier regarding Member ID 984012019. Upon secondary medical director review and evaluation of the submitted CPB criteria, the prior denial has been OVERTURNED. The claim is approved for payment.",
    "body_html": "<p>We have received your Level 1 Appeal dossier...</p>",
    "attachments": [
      {
        "filename": "determination_letter_CLM8942.pdf",
        "content_type": "application/pdf",
        "size_bytes": 149204,
        "url": "https://api.agentmail.to/v0/messages/msg_9841029384/attachments/att_1029"
      }
    ]
  }
}
```

---

## 3. Expected Webhook Response

- **Status Code**: `200 OK`
- **Response Body**:
```json
{
  "received": true,
  "claimId": "k57291048291049281",
  "statusUpdated": "overturned_won"
}
```

# Webhook Contract: AgentMail Inbound Event Stream

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Ready for Implementation  

---

## 1. Webhook Endpoint Specification

- **Method**: `POST`
- **Path**: `/agentmail-webhook`
- **Headers**:
  - `Content-Type: application/json`
  - `svix-id`: Unique event message identifier
  - `svix-timestamp`: Unix timestamp in seconds
  - `svix-signature`: Versioned HMAC-SHA256 signature (`v1,<base64_hmac>`)
- **Environment Variable**: `AGENTMAIL_WEBHOOK_SECRET` (`whsec_...`)

### Cryptographic Verification Algorithm
1. Extract `svix-id`, `svix-timestamp`, and `svix-signature` headers.
2. Check timestamp drift against maximum tolerance (300 seconds / 5 minutes) to protect against replay attacks.
3. Construct payload to sign: `${svix_id}.${svix_timestamp}.${raw_body}`.
4. Calculate HMAC-SHA256 over payload using decoded secret key bytes.
5. Perform constant-time comparison against each versioned signature (`v1,...`) in `svix-signature`.

---

## 2. Inbound Message Payload Example

```json
{
  "type": "event",
  "event_type": "message.received",
  "event_id": "evt_123abc",
  "message": {
    "message_id": "<msg_9841029384@agentmail.to>",
    "thread_id": "thread_123",
    "inbox_id": "inbox_claimhero_sender",
    "from_": ["billing@clinic.example"],
    "to": ["claimhero-sender@agentmail.to"],
    "subject": "Denial notice for review",
    "text": "Please review the attached denial notice.",
    "html": "<p>Please review the attached denial notice.</p>",
    "attachments": [
      {
        "attachment_id": "att_1029",
        "filename": "denial_notice.pdf",
        "content_type": "application/pdf",
        "size": 149204
      }
    ]
  }
}
```

---

## 3. Expected Webhook Responses

### Success (Accepted)
- **Status Code**: `202 Accepted`
- **Response Body**:
```json
{
  "accepted": true,
  "eventId": "evt_123abc"
}
```

### Unauthorized (Invalid Signature or Expired Timestamp)
- **Status Code**: `401 Unauthorized`
- **Response Body**:
```json
{
  "error": "Signature verification failed"
}
```

### Bad Request (Malformed JSON or Missing Fields)
- **Status Code**: `400 Bad Request`
- **Response Body**:
```json
{
  "error": "Missing required AgentMail event fields"
}
```

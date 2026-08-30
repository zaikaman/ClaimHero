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
  - `svix-id`, `svix-timestamp`, and `svix-signature` (provided by AgentMail)

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
    "inbox_id": "inbox_claimhero_intake",
    "from_": ["billing@clinic.example"],
    "to": ["claimhero-intake@agentmail.to"],
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

## 3. Expected Webhook Response

- **Status Code**: `202 Accepted`
- **Response Body**:
```json
{
  "accepted": true,
  "eventId": "evt_123abc"
}
```

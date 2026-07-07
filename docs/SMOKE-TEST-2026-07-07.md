# Smoke Test Report - 2026-07-07

## Scope
This smoke test validates legitimacy guardrails and campaign data behavior after the compliance hardening update.

## Environment
- App: Django backend
- URL: http://127.0.0.1:4000
- Runtime: local virtual environment
- Temporary smoke API key: configured in process environment only

## Preconditions
1. Applied migrations through `core.0007_prospect_compliance_basis_and_more`.
2. Seeded smoke records:
- `smoke-prospect-compliant` with complete compliance metadata
- `smoke-prospect-blocked` missing compliance metadata
- `smoke-job-compliant` pending email job linked to compliant prospect
- `smoke-job-blocked` pending email job linked to non-compliant prospect

## Test Cases and Results

### 1) Health endpoint responds
- Request: `GET /api/health`
- Expected: HTTP 200 with service status payload
- Result: PASS
- Evidence:
```json
{"ok":true,"service":"digital-sales-automation-center"}
```

### 2) Campaign endpoint includes real top-10 campaign and contact emails
- Request: `GET /api/campaigns`
- Expected: campaign `camp-top-10-first-contact` exists with 10 targets and `contactEmail` field
- Result: PASS
- Evidence:
- `TOP10_TARGET_COUNT=10`
- Sample target payload:
```json
{"company":"Asaak","country":"Uganda","industry":"FinTech","website":"","contactEmail":"info@asaak.co","fitNotes":"Lending and fintech platform","matchedProducts":["Elite Fintech Systems"]}
```

### 3) Email job processing sends only compliance-ready job
- Request: `POST /api/email-jobs/process` with admin API key
- Expected: compliant job sent, non-compliant job remains for next processing pass
- Result: PASS
- Evidence:
```json
{"requestedLimit":10,"sendRateCap":1,"effectiveLimit":1,"processed":1,"sent":1,"suppressed":0,"blockedCompliance":0,"failed":0,"remaining":1}
```

### 4) Email job processing blocks non-compliant job
- Request: second `POST /api/email-jobs/process` with admin API key
- Expected: non-compliant job marked `blocked_compliance`
- Result: PASS
- Evidence:
```json
{"requestedLimit":10,"sendRateCap":1,"effectiveLimit":1,"processed":1,"sent":0,"suppressed":0,"blockedCompliance":1,"failed":0,"remaining":0}
```

### 5) Prospect ingestion rejects missing compliance metadata
- Request: `POST /api/prospects` missing `sourceProvider`, `sourceRecordId`, and `complianceBasis`
- Expected: HTTP 400 with explicit compliance requirements
- Result: PASS
- Evidence:
```json
{"error": "sourceProvider, sourceRecordId, and valid complianceBasis are required", "requiredComplianceBasis": ["consent", "contractual_necessity", "legitimate_interest"]}
```

## Conclusion
Legitimacy controls are active in both ingest and outbound processing paths:
- Non-compliant intake is blocked.
- Outbound sends are blocked unless linked to a prospect with verified compliance metadata.
- Campaign data uses real named targets and public business contact channels.

## Follow-up Recommendations
1. Add provider-level verification status for each `CampaignTarget.public_contact_email` (Hunter/NeverBounce pass/fail and timestamp).
2. Require `payload.prospectId` for all `EmailJob` creation paths to prevent untraceable outbound jobs.
3. Add automated CI smoke test script to run these checks after deploy.

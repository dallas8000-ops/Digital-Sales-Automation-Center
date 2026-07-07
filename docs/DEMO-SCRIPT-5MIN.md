# 3-5 Minute Demo Script (Sales-Ready)

## Goal

Show a real business workflow from lead capture to outreach readiness in under 5 minutes.

## Pre-demo setup (2 minutes before recording)

1. Open `https://gilliomfrontlinedigital.com/index.html` and `https://gilliomfrontlinedigital.com/analytics.html`.
2. Confirm API health quickly:
   - `https://api.gilliomfrontlinedigital.com/api/health` (or Railway service URL fallback)
3. Prepare one prospect payload and one campaign name.

## Demo flow (talk track)

### 1) Platform overview (0:00-0:30)

- Show dashboard analytics.
- Say: this is a Django-based automation center for lead intake, qualification, and outbound preparation.

### 2) Create/import a prospect (0:30-1:30)

- Go to Prospects page.
- Add one realistic contact (name, company, email, domain).
- Show it appears in list immediately.

### 3) Show qualification + operational data (1:30-2:20)

- Open analytics/activity.
- Show updated counts and recent activity trail.
- Mention data is persisted in ORM-backed models (not JSON files).

### 4) Build and launch a campaign action (2:20-3:30)

- Create a campaign from Campaigns page.
- Trigger send/sequence action.
- Explain safeguards: suppression handling, unsubscribe workflow, and send-rate controls.

### 5) Compliance + production hardening close (3:30-4:30)

- Mention protected admin/process APIs require key auth.
- Mention production config hardening (`DEBUG=false`, host allow-list).
- Mention deploy target and custom domain setup.

### 6) Buyer close (4:30-5:00)

- State this can be transferred with repository + Railway + DNS in one handoff session.

## Recording checklist

- Use a clean browser profile.
- Zoom to 110-125% so text is readable in video.
- Keep terminal ready for one health check call.
- Keep recording under 5 minutes.

## Optional one-line value pitch

"This system gives a small team a ready-to-run pipeline from inbound lead capture to compliant outbound execution on a production-hosted Django stack."

import csv
import json
import os
import re
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode, urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils import timezone as dj_timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .models import Activity, AppSetting, Campaign, EmailEvent, EmailJob, Product, Prospect, SuppressionList


PUBLIC_DIR = Path(settings.BASE_DIR) / "public"
APP_CONFIG_KEY = "app_config"
UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365

DEFAULT_PRODUCTS = [
    {
        "id": "prod-ai-studio",
        "name": "AI Software Operations Studio",
        "category": "AI Engineering",
        "priceFrom": 9,
        "description": "Starter $9/month, Pro $79/month, Enterprise custom quote.",
    },
    {
        "id": "prod-stripe-center",
        "name": "Deployment & Stripe Automation Center",
        "category": "Payments",
        "priceFrom": 79,
        "description": "Flat rate $79/month for client access and subscription operations.",
    },
    {
        "id": "prod-specwright",
        "name": "Specwright",
        "category": "Productivity",
        "priceFrom": 29,
        "description": "Starter $29/month, Pro $79/month, annual billing approximately 20% off.",
    },
    {
        "id": "prod-dbops",
        "name": "DBOps Control Center",
        "category": "Database Operations",
        "priceFrom": 79,
        "description": "Starter $79/month, Pro $149/month, Enterprise $399/month.",
    },
    {
        "id": "prod-fintech",
        "name": "Elite Fintech Systems",
        "category": "FinTech",
        "priceFrom": 12,
        "description": "Tier anchors: $12/$35/$120 monthly, localized with VAT in supported regions.",
    },
    {
        "id": "prod-enpower-command-pro",
        "name": "EnPowerCommandPro",
        "category": "Operations",
        "priceFrom": 39,
        "description": "$39/month monthly client access plan.",
    },
    {
        "id": "prod-righand",
        "name": "RigHand AI",
        "category": "Transportation",
        "priceFrom": 34.99,
        "description": "Compliance Pro $34.99/month and Fleet Lite $89/month.",
    },
    {
        "id": "prod-pc-checker",
        "name": "PC Checker Extreme",
        "category": "IT Support",
        "priceFrom": 4,
        "description": "$4/month (pricing page currently unavailable in production URL).",
    },
    {
        "id": "prod-eastbridge-ops",
        "name": "EastBridge Ops Intelligence",
        "category": "Operations",
        "priceFrom": 0,
        "description": "No published paid Stripe pricing page yet (internal catalog placeholder).",
    },
]

DEFAULT_CONFIG = {
    "companyName": "Gilliom Frontline Digital",
    "website": "https://gilliomfrontlinedigital.com/",
    "founder": "Barney R. Gilliom",
    "aiAutomation": {
        "enabled": True,
        "dailyLimit": 25,
        "jobTitle": "CTO",
        "tone": "consultative",
        "resumeSummary": "",
        "lastDailyRunOn": None,
        "lastRunSummary": None,
    },
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return {}


def tier_for_score(score):
    value = int(score or 0)
    if value >= 80:
        return "Hot"
    if value >= 60:
        return "Warm"
    return "Cold"


def hunter_json(url):
    req = Request(url, headers={"User-Agent": "DSAC-Django/1.0"})
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode("utf-8"))


def validate_email_hunter(email, api_key):
    domain = email.split("@")[-1] if "@" in email else ""
    query = urlencode({"email": email, "domain": domain, "api_key": api_key})
    data = hunter_json(f"https://api.hunter.io/v2/email-verifier?{query}")
    status = data.get("data", {}).get("status")
    return {
        "email": email,
        "valid": status == "valid",
        "reason": status or "invalid",
        "score": data.get("data", {}).get("score"),
        "sources": data.get("data", {}).get("sources") or [],
    }


def validate_domain_hunter(website, api_key):
    hostname = (urlparse(website).hostname or website or "").strip().lower()
    query = urlencode({"domain": hostname, "api_key": api_key})
    data = hunter_json(f"https://api.hunter.io/v2/domain-search?{query}")
    ok = bool(data.get("data"))
    return {
        "domain": hostname,
        "valid": ok,
        "reason": "Domain found" if ok else "Domain not found",
    }


def normalize_url(raw):
    value = str(raw or "").strip()
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    return f"https://{value}"


def detect_tech(url):
    normalized = normalize_url(url)
    if not normalized:
        return {"url": url, "validated": False, "technologies": [], "confidence": 0, "notes": "No URL provided."}

    tech = set()
    evidence = []
    try:
        req = Request(
            normalized,
            headers={"User-Agent": "Mozilla/5.0 (compatible; DSAC-Tech-Detector/1.0)", "Accept": "text/html"},
        )
        with urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8", errors="ignore").lower()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            server = headers.get("server", "").lower()
            if "nginx" in server:
                tech.add("Nginx")
                evidence.append("server header contains nginx")
            if "cloudflare" in server or headers.get("cf-ray"):
                tech.add("Cloudflare")
                evidence.append("cloudflare headers detected")
            if "_next/" in body or "__next_data__" in body:
                tech.update(["Next.js", "React"])
                evidence.append("next.js runtime markers in html")
            if "wordpress" in body or "wp-content" in body:
                tech.add("WordPress")
                evidence.append("wordpress markers in html")
            if "js.stripe.com" in body:
                tech.add("Stripe")
                evidence.append("stripe client script detected")

            technologies = sorted(tech)
            confidence = min(0.95, round(0.5 + len(technologies) * 0.07, 2)) if technologies else 0.35
            return {
                "url": normalized,
                "statusCode": getattr(resp, "status", 200),
                "validated": True,
                "technologies": technologies,
                "confidence": confidence,
                "evidence": evidence[:12],
                "notes": "Validated from live headers and HTML fingerprint signals.",
            }
    except (HTTPError, URLError, TimeoutError) as exc:
        return {
            "url": normalized,
            "validated": False,
            "technologies": ["Node.js", "PostgreSQL", "AWS", "Nginx"],
            "confidence": 0.35,
            "notes": f"Live validation failed, heuristic fallback used: {exc}",
        }


def ensure_defaults():
    if Product.objects.count() == 0:
        Product.objects.bulk_create(
            [
                Product(
                    id=item["id"],
                    name=item["name"],
                    category=item.get("category", ""),
                    price_from=float(item.get("priceFrom", 0) or 0),
                    description=item.get("description", ""),
                    created_at=dj_timezone.now(),
                    updated_at=dj_timezone.now(),
                )
                for item in DEFAULT_PRODUCTS
            ]
        )
    AppSetting.objects.get_or_create(key=APP_CONFIG_KEY, defaults={"value": DEFAULT_CONFIG})


def get_config_value():
    ensure_defaults()
    setting, _ = AppSetting.objects.get_or_create(key=APP_CONFIG_KEY, defaults={"value": DEFAULT_CONFIG})
    value = setting.value or {}
    merged = {**DEFAULT_CONFIG, **value}
    if not isinstance(merged.get("aiAutomation"), dict):
        merged["aiAutomation"] = DEFAULT_CONFIG["aiAutomation"]
    else:
        merged["aiAutomation"] = {**DEFAULT_CONFIG["aiAutomation"], **merged["aiAutomation"]}
    return merged


def save_config_value(value):
    setting, _ = AppSetting.objects.get_or_create(key=APP_CONFIG_KEY, defaults={"value": DEFAULT_CONFIG})
    setting.value = value
    setting.save(update_fields=["value", "updated_at"])


def serialize_product(product):
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category,
        "priceFrom": product.price_from,
        "description": product.description,
    }


def serialize_prospect(item):
    return {
        "id": item.id,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
        "company": item.company,
        "firstName": item.first_name,
        "lastName": item.last_name,
        "email": item.email,
        "website": item.website,
        "title": item.title,
        "industry": item.industry,
        "country": item.country,
        "status": item.status,
        "stage": item.stage,
        "engagementLevel": item.engagement_level,
        "recommendedProduct": item.recommended_product,
        "dataQuality": item.data_quality or {},
        "validation": item.validation or {},
        "score": item.score,
        "tier": item.tier,
    }


def serialize_campaign(item):
    return {
        "id": item.id,
        "name": item.name,
        "subjectTemplate": item.subject_template,
        "bodyTemplate": item.body_template,
        "status": item.status,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
    }


def append_activity(event_type, message, metadata=None):
    Activity.objects.create(
        id=str(uuid.uuid4()),
        type=event_type,
        message=message,
        metadata=metadata or {},
        created_at=dj_timezone.now(),
        updated_at=dj_timezone.now(),
    )


def require_api_key(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        configured_key = os.getenv("ADMIN_API_KEY", "").strip()
        if not configured_key:
            return JsonResponse({"error": "ADMIN_API_KEY is not configured"}, status=503)

        provided_key = (
            request.headers.get("X-API-Key", "").strip()
            or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            or str(request.GET.get("apiKey") or "").strip()
        )
        if provided_key != configured_key:
            return JsonResponse({"error": "unauthorized"}, status=401)
        return view_func(request, *args, **kwargs)

    return wrapped


def build_unsubscribe_token(email):
    signer = TimestampSigner(salt="dsac-unsubscribe")
    return signer.sign(email.strip().lower())


def parse_unsubscribe_token(token):
    signer = TimestampSigner(salt="dsac-unsubscribe")
    value = signer.unsign(unquote(token), max_age=UNSUBSCRIBE_TOKEN_TTL_SECONDS)
    return value.strip().lower()


def build_unsubscribe_url(email):
    base = os.getenv("APP_BASE_URL", "http://localhost:4000").rstrip("/")
    token = quote(build_unsubscribe_token(email), safe="")
    return f"{base}/api/suppressions/unsubscribe?token={token}"


def get_send_rate_cap():
    config = get_config_value()
    compliance = config.get("emailCompliance") if isinstance(config.get("emailCompliance"), dict) else {}
    cap = int(compliance.get("maxSendsPerRun") or 50)
    return max(1, min(cap, 1000))


@require_GET
def api_health(_request):
    return JsonResponse({"ok": True, "service": "digital-sales-automation-center"})


@require_GET
def api_config(_request):
    return JsonResponse(get_config_value())


@require_GET
def api_products(_request):
    ensure_defaults()
    return JsonResponse([serialize_product(p) for p in Product.objects.all().order_by("name")], safe=False)


@require_http_methods(["GET", "POST"])
@csrf_exempt
@require_api_key
def api_prospects(request):
    if request.method == "GET":
        queryset = Prospect.objects.all().order_by("-created_at")
        return JsonResponse([serialize_prospect(item) for item in queryset], safe=False)

    payload = parse_json_body(request)
    if not payload.get("company") or not payload.get("email"):
        return JsonResponse({"error": "company and email are required"}, status=400)

    api_key = os.getenv("HUNTER_API_KEY", "").strip()
    if not api_key:
        return JsonResponse(
            {
                "error": "Data verification requires HUNTER_API_KEY in .env",
                "reason": "API key not configured",
                "mustVerify": True,
            },
            status=400,
        )

    try:
        email_validation = validate_email_hunter(payload.get("email"), api_key)
        domain_validation = validate_domain_hunter(payload.get("website"), api_key)
    except Exception as exc:
        return JsonResponse({"error": "Data not confirmed", "reason": f"Verification service error: {exc}", "saved": False}, status=503)

    if email_validation.get("valid") is not True:
        return JsonResponse(
            {
                "error": "Data not confirmed",
                "reason": "Email validation failed",
                "email": payload.get("email"),
                "validation": {"email": email_validation, "domain": None},
                "saved": False,
            },
            status=422,
        )

    if domain_validation.get("valid") is not True:
        return JsonResponse(
            {
                "error": "Data not confirmed",
                "reason": "Domain validation failed",
                "company": payload.get("company"),
                "validation": {"email": email_validation, "domain": domain_validation},
                "saved": False,
            },
            status=422,
        )

    score = int(payload.get("score") or 30)
    item = Prospect.objects.create(
        id=str(uuid.uuid4()),
        company=payload.get("company"),
        first_name=payload.get("firstName") or "",
        last_name=payload.get("lastName") or "",
        email=payload.get("email"),
        website=payload.get("website") or "",
        title=payload.get("title") or "",
        industry=payload.get("industry") or "",
        country=payload.get("country") or "",
        status=payload.get("status") or "new",
        stage=payload.get("stage") or "lead",
        engagement_level=int(payload.get("engagementLevel") or 0),
        recommended_product=payload.get("recommendedProduct") or "AI Software Operations Studio",
        data_quality={
            "isReal": True,
            "isVerified": True,
            "validation": {"email": "valid", "domain": "valid"},
            "sources": ["manual-entry-verified"],
            "verifiedAt": now_iso(),
            "emailScore": email_validation.get("score"),
        },
        validation={"email": email_validation, "domain": domain_validation},
        score=score,
        tier=tier_for_score(score),
        created_at=dj_timezone.now(),
        updated_at=dj_timezone.now(),
    )

    append_activity("prospect.created", f"Real verified prospect added: {item.company}", {"prospectId": item.id})
    return JsonResponse(serialize_prospect(item), status=201)


@require_GET
@require_api_key
def api_prospects_query(request):
    queryset = Prospect.objects.all()
    search = str(request.GET.get("search", "")).strip().lower()
    industry = str(request.GET.get("industry", "")).strip().lower()
    country = str(request.GET.get("country", "")).strip().lower()
    stage = str(request.GET.get("stage", "")).strip().lower()
    tier = str(request.GET.get("tier", "")).strip().lower()
    product = str(request.GET.get("product", "")).strip().lower()
    min_score = request.GET.get("minScore")
    max_score = request.GET.get("maxScore")
    sort_by = request.GET.get("sortBy", "score")
    sort_dir = request.GET.get("sortDir", "desc")
    page = max(1, int(request.GET.get("page", 1)))
    page_size = min(500, max(1, int(request.GET.get("pageSize", 50))))

    items = [serialize_prospect(item) for item in queryset]

    def match(item):
        haystack = " ".join(
            [
                str(item.get("company", "")),
                str(item.get("firstName", "")),
                str(item.get("lastName", "")),
                str(item.get("email", "")),
                str(item.get("industry", "")),
                str(item.get("country", "")),
                str(item.get("recommendedProduct", "")),
            ]
        ).lower()
        if search and search not in haystack:
            return False
        if industry and str(item.get("industry", "")).lower() != industry:
            return False
        if country and str(item.get("country", "")).lower() != country:
            return False
        if stage and str(item.get("stage", "")).lower() != stage:
            return False
        if tier and str(item.get("tier", "")).lower() != tier:
            return False
        if product and str(item.get("recommendedProduct", "")).lower() != product:
            return False
        score = int(item.get("score") or 0)
        if min_score not in (None, "") and score < int(min_score):
            return False
        if max_score not in (None, "") and score > int(max_score):
            return False
        return True

    filtered = [item for item in items if match(item)]
    reverse = str(sort_dir).lower() != "asc"
    filtered.sort(key=lambda x: x.get(sort_by) if x.get(sort_by) is not None else "", reverse=reverse)
    total = len(filtered)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    page_items = filtered[start : start + page_size]

    return JsonResponse(
        {
            "items": page_items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages,
        }
    )


@require_GET
@require_api_key
def api_prospects_possible_clients(request):
    limit = max(1, min(500, int(request.GET.get("limit", 100))))
    prospects = Prospect.objects.all().order_by("-score", "company")[:limit]
    return JsonResponse([serialize_prospect(p) for p in prospects], safe=False)


@require_GET
@require_api_key
def api_prospects_export_csv(_request):
    prospects = Prospect.objects.all().order_by("-created_at")
    fieldnames = ["company", "firstName", "lastName", "email", "website", "industry", "country", "stage", "score", "tier"]
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = "attachment; filename=prospects-export.csv"
    writer = csv.DictWriter(response, fieldnames=fieldnames)
    writer.writeheader()
    for item in prospects:
        row = serialize_prospect(item)
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return response


@require_http_methods(["GET", "POST"])
@csrf_exempt
def api_campaigns(request):
    if request.method == "GET":
        campaigns = Campaign.objects.all().order_by("-created_at")
        return JsonResponse([serialize_campaign(item) for item in campaigns], safe=False)

    payload = parse_json_body(request)
    name = str(payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name is required"}, status=400)

    item = Campaign.objects.create(
        id=str(uuid.uuid4()),
        name=name,
        subject_template=str(payload.get("subjectTemplate") or ""),
        body_template=str(payload.get("bodyTemplate") or ""),
        status=str(payload.get("status") or "draft"),
        created_at=dj_timezone.now(),
        updated_at=dj_timezone.now(),
    )
    append_activity("campaign.created", f"Campaign created: {item.name}", {"campaignId": item.id})
    return JsonResponse(serialize_campaign(item), status=201)


@require_GET
def api_integrations_status(_request):
    stripe_secret = bool(os.getenv("STRIPE_SECRET_KEY"))
    stripe_pub = bool(os.getenv("STRIPE_PUBLISHABLE_KEY"))
    webhook = bool(os.getenv("STRIPE_WEBHOOK_SECRET"))
    smtp_host = bool(os.getenv("SMTP_HOST"))
    smtp_user = bool(os.getenv("SMTP_USER"))
    smtp_port = bool(os.getenv("SMTP_PORT", "587"))
    openai_key = bool(os.getenv("OPENAI_API_KEY"))

    return JsonResponse(
        {
            "stripe": {
                "enabled": stripe_secret,
                "hasWebhookSecret": webhook,
                "publishableKeyConfigured": stripe_pub,
                "apiVersion": os.getenv("STRIPE_API_VERSION", "default"),
            },
            "email": {
                "enabled": smtp_host and smtp_user,
                "hostConfigured": smtp_host,
                "portConfigured": smtp_port,
                "authConfigured": smtp_user,
            },
            "ai": {"enabled": openai_key, "model": os.getenv("OPENAI_MODEL", "gpt-4")},
            "queues": {
                "pendingEmailJobs": EmailJob.objects.exclude(status="sent").count(),
                "sentEmailEvents": EmailEvent.objects.count(),
                "payments": 0,
            },
        }
    )


@require_GET
@require_api_key
def api_email_jobs(_request):
    jobs = EmailJob.objects.all().order_by("-created_at")
    return JsonResponse(
        [
            {
                "id": job.id,
                "type": job.job_type,
                "toEmail": job.to_email,
                "status": job.status,
                "payload": job.payload,
                "processedAt": job.processed_at.isoformat() if job.processed_at else None,
                "createdAt": job.created_at.isoformat(),
                "updatedAt": job.updated_at.isoformat(),
            }
            for job in jobs
        ],
        safe=False,
    )


@require_http_methods(["GET", "POST"])
@csrf_exempt
def api_suppressions(request):
    if request.method == "GET":
        items = SuppressionList.objects.all().order_by("-created_at")
        return JsonResponse(
            [
                {
                    "email": item.email,
                    "reason": item.reason,
                    "source": item.source,
                    "createdAt": item.created_at.isoformat(),
                    "updatedAt": item.updated_at.isoformat(),
                }
                for item in items
            ],
            safe=False,
        )

    payload = parse_json_body(request)
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        return JsonResponse({"error": "email is required"}, status=400)
    reason = str(payload.get("reason") or "manual").strip() or "manual"
    source = str(payload.get("source") or "admin").strip() or "admin"
    token = build_unsubscribe_token(email)
    item, created = SuppressionList.objects.update_or_create(
        email=email,
        defaults={
            "reason": reason,
            "source": source,
            "unsubscribe_token": token,
            "updated_at": dj_timezone.now(),
        },
    )
    append_activity("suppression.updated", f"Suppression {'created' if created else 'updated'} for {email}", {"reason": reason, "source": source})
    return JsonResponse(
        {
            "email": item.email,
            "reason": item.reason,
            "source": item.source,
            "created": created,
        },
        status=201 if created else 200,
    )


@require_http_methods(["GET", "POST"])
@csrf_exempt
def api_suppressions_unsubscribe(request):
    token = request.GET.get("token") if request.method == "GET" else parse_json_body(request).get("token")
    if not token:
        return JsonResponse({"error": "token is required"}, status=400)

    try:
        email = parse_unsubscribe_token(token)
    except SignatureExpired:
        return JsonResponse({"error": "token expired"}, status=410)
    except BadSignature:
        return JsonResponse({"error": "invalid token"}, status=400)

    item, _ = SuppressionList.objects.update_or_create(
        email=email,
        defaults={
            "reason": "unsubscribe",
            "source": "recipient",
            "unsubscribe_token": token,
            "updated_at": dj_timezone.now(),
        },
    )
    append_activity("suppression.unsubscribe", f"Recipient unsubscribed: {email}", {"email": email})
    return JsonResponse({"ok": True, "email": item.email, "suppressed": True})


@require_http_methods(["POST"])
@csrf_exempt
@require_api_key
def api_email_jobs_process(request):
    payload = parse_json_body(request)
    requested_limit = int(payload.get("limit") or 500)
    send_rate_cap = get_send_rate_cap()
    effective_limit = min(max(1, requested_limit), send_rate_cap)
    jobs = list(EmailJob.objects.filter(status="pending").order_by("created_at")[:effective_limit])
    sent = 0
    failed = 0
    suppressed = 0
    processed = 0
    now = dj_timezone.now()

    for job in jobs:
        processed += 1
        email = str(job.to_email or "").strip().lower()
        if email and SuppressionList.objects.filter(email=email).exists():
            job.status = "suppressed"
            job.processed_at = now
            job.updated_at = now
            job.save(update_fields=["status", "processed_at", "updated_at"])
            EmailEvent.objects.create(
                id=str(uuid.uuid4()),
                event_type="email.suppressed",
                job=job,
                metadata={"jobId": job.id, "email": email},
                created_at=now,
            )
            suppressed += 1
            continue

        payload_with_unsub = dict(job.payload or {})
        payload_with_unsub["unsubscribeUrl"] = build_unsubscribe_url(email)
        payload_with_unsub["unsubscribeTokenGeneratedAt"] = now_iso()
        job.payload = payload_with_unsub
        job.status = "sent"
        job.processed_at = now
        job.updated_at = now
        job.save(update_fields=["status", "processed_at", "updated_at", "payload"])
        EmailEvent.objects.create(
            id=str(uuid.uuid4()),
            event_type="email.sent",
            job=job,
            metadata={"jobId": job.id, "toEmail": email, "unsubscribeUrl": payload_with_unsub["unsubscribeUrl"]},
            created_at=now,
        )
        sent += 1

    append_activity(
        "email.jobs.processed",
        f"Processed {processed} jobs (sent={sent}, suppressed={suppressed})",
        {
            "requestedLimit": requested_limit,
            "sendRateCap": send_rate_cap,
            "effectiveLimit": effective_limit,
            "processed": processed,
            "sent": sent,
            "suppressed": suppressed,
            "failed": failed,
        },
    )
    remaining = EmailJob.objects.filter(status="pending").count()
    return JsonResponse(
        {
            "requestedLimit": requested_limit,
            "sendRateCap": send_rate_cap,
            "effectiveLimit": effective_limit,
            "processed": processed,
            "sent": sent,
            "suppressed": suppressed,
            "failed": failed,
            "remaining": remaining,
        }
    )


@require_GET
@require_api_key
def api_ai_automation_status(_request):
    config = get_config_value()
    cfg = config.get("aiAutomation", DEFAULT_CONFIG["aiAutomation"])
    queue = {
        "outreach": EmailJob.objects.filter(job_type="outreach").exclude(status="sent").count(),
        "followUps": EmailJob.objects.filter(job_type="follow-up").exclude(status="sent").count(),
        "totalPending": EmailJob.objects.exclude(status="sent").count(),
    }
    return JsonResponse({"config": cfg, "queue": queue})


@require_http_methods(["POST"])
@csrf_exempt
@require_api_key
def api_ai_automation_settings(request):
    payload = parse_json_body(request)
    config = get_config_value()
    existing = config.get("aiAutomation", DEFAULT_CONFIG["aiAutomation"])
    updated = {
        **existing,
        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
        "dailyLimit": int(payload.get("dailyLimit") or existing.get("dailyLimit", 25)),
        "jobTitle": payload.get("jobTitle") or existing.get("jobTitle", "CTO"),
        "tone": payload.get("tone") or existing.get("tone", "consultative"),
        "resumeSummary": payload.get("resumeSummary") if payload.get("resumeSummary") is not None else existing.get("resumeSummary", ""),
    }
    config["aiAutomation"] = updated
    save_config_value(config)
    append_activity("ai.automation.settings_saved", "Saved AI automation settings", {"enabled": updated["enabled"]})
    return JsonResponse(updated)


@require_http_methods(["POST"])
@csrf_exempt
@require_api_key
def api_ai_automation_run(_request):
    config = get_config_value()
    now = now_iso()
    summary = {
        "mode": "manual",
        "ranAt": now,
        "topProspectsEvaluated": 0,
        "outreachQueued": 0,
        "followUpsQueued": 0,
        "repliedInquiriesReviewed": 0,
        "recommendations": [],
    }
    cfg = config.get("aiAutomation", DEFAULT_CONFIG["aiAutomation"])
    cfg["lastRunSummary"] = summary
    cfg["lastDailyRunOn"] = now.split("T")[0]
    config["aiAutomation"] = cfg
    save_config_value(config)
    append_activity("ai.automation.run", "Executed AI automation run", summary)
    return JsonResponse({"ok": True, "summary": summary})


@require_GET
def api_ai_pipeline_recommendations(request):
    limit = max(1, min(50, int(request.GET.get("limit", 12))))
    items = Prospect.objects.all().order_by("-score", "company")[:limit]
    recommendations = [
        {
            "prospectId": item.id,
            "company": item.company,
            "stage": item.stage or "lead",
            "score": int(item.score or 0),
            "tier": item.tier or tier_for_score(item.score or 0),
            "nextAction": "send-personalized-outreach",
            "reason": "Top-scored lead in current pipeline.",
            "prompt": f"Draft a concise professional outreach email to {item.company}.",
        }
        for item in items
    ]
    return JsonResponse({"total": len(recommendations), "items": recommendations})


@require_http_methods(["POST"])
@csrf_exempt
def api_discovery_tech_detect(request):
    payload = parse_json_body(request)
    url = payload.get("url")
    if not url:
        return JsonResponse({"error": "url is required"}, status=400)
    return JsonResponse(detect_tech(url))


@require_GET
def api_sales_assets(_request):
    return JsonResponse(
        {
            "jobBoardTemplates": {
                "indeed": "Hi [Name], I noticed your role focus on [priority].",
                "glassdoor": "Hi [Name], based on your priorities, teams are juggling AI tooling across fragmented workflows.",
            },
            "pricingSheets": [
                {"solution": "AI Software Operations Studio", "starter": "$7,500", "growth": "$15,000", "enterprise": "$35,000+"}
            ],
        }
    )


@require_GET
def api_sales_calendar(request):
    year = int(request.GET.get("year", datetime.now(timezone.utc).year))
    months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ]
    return JsonResponse(
        [
            {
                "month": m,
                "year": year,
                "theme": "AI Engineering Operations" if i % 2 == 0 else "Automation ROI Stories",
                "emailCampaign": f"{m} Industry Segment Campaign",
            }
            for i, m in enumerate(months)
        ],
        safe=False,
    )


@require_GET
def api_sales_sequence(request):
    product = request.GET.get("product", "AI Software Operations Studio")
    role = request.GET.get("role", "engineering leader")
    return JsonResponse(
        [
            {"day": 1, "subject": f"Helping {role}s Reduce Delivery Friction", "objective": "Introduce value proposition"},
            {"day": 5, "subject": "Operational Business Case", "objective": "Share measurable scenario"},
            {"day": 12, "subject": "Relevant Customer Scenario", "objective": "Present tailored use case"},
            {"day": 21, "subject": f"Live Demo Invitation for {product}", "objective": "Secure meeting"},
        ],
        safe=False,
    )


@require_GET
def serve_public_page(_request, page="index.html"):
    clean = re.sub(r"[^a-zA-Z0-9._/-]", "", page or "index.html")
    candidate = (PUBLIC_DIR / clean).resolve()
    if not str(candidate).startswith(str(PUBLIC_DIR.resolve())) or not candidate.exists() or candidate.is_dir():
        candidate = PUBLIC_DIR / "index.html"
    return FileResponse(open(candidate, "rb"))

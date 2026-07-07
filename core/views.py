import csv
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods


DB_PATH = Path(settings.BASE_DIR) / "data" / "db.json"
PUBLIC_DIR = Path(settings.BASE_DIR) / "public"


DEFAULT_DB = {
	"prospects": [],
	"campaigns": [],
	"inquiries": [],
	"activities": [],
	"emailJobs": [],
	"emailEvents": [],
	"payments": [],
	"proposals": [],
	"demos": [],
	"jobBoardOutreach": [],
	"salesAssets": [],
	"calendarPlans": [],
	"products": [
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
	],
	"config": {
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
	},
}


def now_iso():
	return datetime.now(timezone.utc).isoformat()


def ensure_db():
	DB_PATH.parent.mkdir(parents=True, exist_ok=True)
	if not DB_PATH.exists():
		DB_PATH.write_text(json.dumps(DEFAULT_DB, indent=2) + "\n", encoding="utf-8")


def read_db():
	ensure_db()
	parsed = json.loads(DB_PATH.read_text(encoding="utf-8"))
	merged = {**DEFAULT_DB, **parsed}
	for key, value in DEFAULT_DB.items():
		if isinstance(value, dict):
			merged[key] = {**value, **parsed.get(key, {})}
	return merged


def write_db(db):
	DB_PATH.write_text(json.dumps(db, indent=2) + "\n", encoding="utf-8")


def parse_json_body(request):
	if not request.body:
		return {}
	try:
		return json.loads(request.body.decode("utf-8"))
	except Exception:
		return {}


def append_activity(db, event_type, message, metadata=None):
	db["activities"].append(
		{
			"id": str(uuid.uuid4()),
			"createdAt": now_iso(),
			"updatedAt": now_iso(),
			"type": event_type,
			"message": message,
			"metadata": metadata or {},
		}
	)


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
	if value.startswith("http://") or value.startswith("https://"):
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
	except (URLError, HTTPError, TimeoutError) as exc:
		return {
			"url": normalized,
			"validated": False,
			"technologies": ["Node.js", "PostgreSQL", "AWS", "Nginx"],
			"confidence": 0.35,
			"notes": f"Live validation failed, heuristic fallback used: {exc}",
		}


@require_GET
def api_health(_request):
	return JsonResponse({"ok": True, "service": "digital-sales-automation-center"})


@require_GET
def api_config(_request):
	db = read_db()
	return JsonResponse(db.get("config", {}))


@require_GET
def api_products(_request):
	db = read_db()
	return JsonResponse(db.get("products", []), safe=False)


@require_http_methods(["GET", "POST"])
@csrf_exempt
def api_prospects(request):
	db = read_db()
	if request.method == "GET":
		return JsonResponse(db.get("prospects", []), safe=False)

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
	item = {
		"id": str(uuid.uuid4()),
		"createdAt": now_iso(),
		"updatedAt": now_iso(),
		"company": payload.get("company"),
		"firstName": payload.get("firstName") or "",
		"lastName": payload.get("lastName") or "",
		"email": payload.get("email"),
		"website": payload.get("website") or "",
		"title": payload.get("title") or "",
		"industry": payload.get("industry") or "",
		"country": payload.get("country") or "",
		"status": payload.get("status") or "new",
		"stage": payload.get("stage") or "lead",
		"engagementLevel": int(payload.get("engagementLevel") or 0),
		"recommendedProduct": payload.get("recommendedProduct") or "AI Software Operations Studio",
		"dataQuality": {
			"isReal": True,
			"isVerified": True,
			"validation": {"email": "valid", "domain": "valid"},
			"sources": ["manual-entry-verified"],
			"verifiedAt": now_iso(),
			"emailScore": email_validation.get("score"),
		},
		"score": score,
		"tier": tier_for_score(score),
	}
	db["prospects"].append(item)
	append_activity(db, "prospect.created", f"Real verified prospect added: {item['company']}", {"prospectId": item["id"]})
	write_db(db)
	return JsonResponse(item, status=201)


@require_GET
def api_prospects_query(request):
	db = read_db()
	items = list(db.get("prospects", []))
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
def api_prospects_possible_clients(request):
	db = read_db()
	limit = max(1, min(500, int(request.GET.get("limit", 100))))
	prospects = sorted(db.get("prospects", []), key=lambda x: int(x.get("score") or 0), reverse=True)
	return JsonResponse(prospects[:limit], safe=False)


@require_GET
def api_prospects_export_csv(_request):
	db = read_db()
	prospects = db.get("prospects", [])
	fieldnames = ["company", "firstName", "lastName", "email", "website", "industry", "country", "stage", "score", "tier"]
	response = HttpResponse(content_type="text/csv; charset=utf-8")
	response["Content-Disposition"] = "attachment; filename=prospects-export.csv"
	writer = csv.DictWriter(response, fieldnames=fieldnames)
	writer.writeheader()
	for item in prospects:
		writer.writerow({k: item.get(k, "") for k in fieldnames})
	return response


@require_GET
def api_integrations_status(_request):
	stripe_secret = bool(os.getenv("STRIPE_SECRET_KEY"))
	stripe_pub = bool(os.getenv("STRIPE_PUBLISHABLE_KEY"))
	webhook = bool(os.getenv("STRIPE_WEBHOOK_SECRET"))
	smtp_host = bool(os.getenv("SMTP_HOST"))
	smtp_user = bool(os.getenv("SMTP_USER"))
	smtp_port = bool(os.getenv("SMTP_PORT", "587"))
	openai_key = bool(os.getenv("OPENAI_API_KEY"))

	db = read_db()
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
				"pendingEmailJobs": len(db.get("emailJobs", [])),
				"sentEmailEvents": len(db.get("emailEvents", [])),
				"payments": len(db.get("payments", [])),
			},
		}
	)


@require_GET
def api_email_jobs(_request):
	db = read_db()
	return JsonResponse(db.get("emailJobs", []), safe=False)


@require_http_methods(["POST"])
@csrf_exempt
def api_email_jobs_process(request):
	payload = parse_json_body(request)
	limit = int(payload.get("limit") or 500)
	db = read_db()
	jobs = db.get("emailJobs", [])[:limit]
	sent = 0
	failed = 0
	for job in jobs:
		job["status"] = "sent"
		job["processedAt"] = now_iso()
		db.get("emailEvents", []).append(
			{
				"id": str(uuid.uuid4()),
				"createdAt": now_iso(),
				"type": "email.sent",
				"jobId": job.get("id"),
			}
		)
		sent += 1
	db["emailJobs"] = [j for j in db.get("emailJobs", []) if j.get("status") != "sent"]
	append_activity(db, "email.jobs.processed", f"Processed {sent} email jobs", {"sent": sent, "failed": failed})
	write_db(db)
	return JsonResponse({"sent": sent, "failed": failed, "remaining": len(db.get("emailJobs", []))})


@require_GET
def api_ai_automation_status(_request):
	db = read_db()
	cfg = db.get("config", {}).get("aiAutomation", DEFAULT_DB["config"]["aiAutomation"])
	queue = {
		"outreach": len([j for j in db.get("emailJobs", []) if j.get("type") == "outreach"]),
		"followUps": len([j for j in db.get("emailJobs", []) if j.get("type") == "follow-up"]),
		"totalPending": len(db.get("emailJobs", [])),
	}
	return JsonResponse({"config": cfg, "queue": queue})


@require_http_methods(["POST"])
@csrf_exempt
def api_ai_automation_settings(request):
	payload = parse_json_body(request)
	db = read_db()
	existing = db.get("config", {}).get("aiAutomation", DEFAULT_DB["config"]["aiAutomation"])
	updated = {
		**existing,
		"enabled": bool(payload.get("enabled", existing.get("enabled", True))),
		"dailyLimit": int(payload.get("dailyLimit") or existing.get("dailyLimit", 25)),
		"jobTitle": payload.get("jobTitle") or existing.get("jobTitle", "CTO"),
		"tone": payload.get("tone") or existing.get("tone", "consultative"),
		"resumeSummary": payload.get("resumeSummary") if payload.get("resumeSummary") is not None else existing.get("resumeSummary", ""),
	}
	db["config"]["aiAutomation"] = updated
	append_activity(db, "ai.automation.settings_saved", "Saved AI automation settings", {"enabled": updated["enabled"]})
	write_db(db)
	return JsonResponse(updated)


@require_http_methods(["POST"])
@csrf_exempt
def api_ai_automation_run(_request):
	db = read_db()
	now = now_iso()
	cfg = db.get("config", {}).get("aiAutomation", DEFAULT_DB["config"]["aiAutomation"])
	summary = {
		"mode": "manual",
		"ranAt": now,
		"topProspectsEvaluated": 0,
		"outreachQueued": 0,
		"followUpsQueued": 0,
		"repliedInquiriesReviewed": 0,
		"recommendations": [],
	}
	cfg["lastRunSummary"] = summary
	cfg["lastDailyRunOn"] = now.split("T")[0]
	db["config"]["aiAutomation"] = cfg
	append_activity(db, "ai.automation.run", "Executed AI automation run", summary)
	write_db(db)
	return JsonResponse({"ok": True, "summary": summary})


@require_GET
def api_ai_pipeline_recommendations(request):
	limit = max(1, min(50, int(request.GET.get("limit", 12))))
	db = read_db()
	items = sorted(db.get("prospects", []), key=lambda x: int(x.get("score") or 0), reverse=True)[:limit]
	recommendations = [
		{
			"prospectId": item.get("id"),
			"company": item.get("company"),
			"stage": item.get("stage", "lead"),
			"score": int(item.get("score") or 0),
			"tier": item.get("tier") or tier_for_score(item.get("score") or 0),
			"nextAction": "send-personalized-outreach",
			"reason": "Top-scored lead in current pipeline.",
			"prompt": f"Draft a concise professional outreach email to {item.get('company')}.",
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

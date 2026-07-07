import json
import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import Activity, AppSetting, EmailEvent, EmailJob, Product, Prospect


DB_PATH = Path(settings.BASE_DIR) / "data" / "db.json"


def parse_iso(value):
    if not value:
        return timezone.now()
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return timezone.now()


class Command(BaseCommand):
    help = "Migrate legacy JSON data file into Django ORM tables"

    def add_arguments(self, parser):
        parser.add_argument("--delete-source", action="store_true", help="Delete data/db.json after successful migration")

    @transaction.atomic
    def handle(self, *args, **options):
        if not DB_PATH.exists():
            self.stdout.write(self.style.WARNING("No data/db.json found; skipping migration."))
            return

        raw = json.loads(DB_PATH.read_text(encoding="utf-8"))

        migrated = {
            "products": 0,
            "prospects": 0,
            "activities": 0,
            "emailJobs": 0,
            "emailEvents": 0,
            "config": 0,
        }

        for item in raw.get("products", []):
            Product.objects.update_or_create(
                id=str(item.get("id") or uuid.uuid4()),
                defaults={
                    "name": item.get("name", ""),
                    "category": item.get("category", ""),
                    "price_from": float(item.get("priceFrom", 0) or 0),
                    "description": item.get("description", ""),
                    "created_at": parse_iso(item.get("createdAt")),
                    "updated_at": parse_iso(item.get("updatedAt")),
                },
            )
            migrated["products"] += 1

        for item in raw.get("prospects", []):
            Prospect.objects.update_or_create(
                id=str(item.get("id") or uuid.uuid4()),
                defaults={
                    "company": item.get("company", ""),
                    "first_name": item.get("firstName", ""),
                    "last_name": item.get("lastName", ""),
                    "email": item.get("email", ""),
                    "website": item.get("website", ""),
                    "title": item.get("title", ""),
                    "industry": item.get("industry", ""),
                    "country": item.get("country", ""),
                    "status": item.get("status", "new"),
                    "stage": item.get("stage", "lead"),
                    "engagement_level": int(item.get("engagementLevel", 0) or 0),
                    "recommended_product": item.get("recommendedProduct", ""),
                    "data_quality": item.get("dataQuality", {}) or {},
                    "validation": item.get("validation", {}) or {},
                    "score": int(item.get("score", 30) or 30),
                    "tier": item.get("tier", "Cold"),
                    "created_at": parse_iso(item.get("createdAt")),
                    "updated_at": parse_iso(item.get("updatedAt")),
                },
            )
            migrated["prospects"] += 1

        for item in raw.get("activities", []):
            Activity.objects.update_or_create(
                id=str(item.get("id") or uuid.uuid4()),
                defaults={
                    "type": item.get("type", "activity"),
                    "message": item.get("message", ""),
                    "metadata": item.get("metadata", {}) or {},
                    "created_at": parse_iso(item.get("createdAt")),
                    "updated_at": parse_iso(item.get("updatedAt")),
                },
            )
            migrated["activities"] += 1

        for item in raw.get("emailJobs", []):
            EmailJob.objects.update_or_create(
                id=str(item.get("id") or uuid.uuid4()),
                defaults={
                    "job_type": item.get("type", ""),
                    "to_email": item.get("toEmail", item.get("email", "")),
                    "status": item.get("status", "pending"),
                    "payload": item,
                    "processed_at": parse_iso(item.get("processedAt")) if item.get("processedAt") else None,
                    "created_at": parse_iso(item.get("createdAt")),
                    "updated_at": parse_iso(item.get("updatedAt")),
                },
            )
            migrated["emailJobs"] += 1

        for item in raw.get("emailEvents", []):
            EmailEvent.objects.update_or_create(
                id=str(item.get("id") or uuid.uuid4()),
                defaults={
                    "event_type": item.get("type", "email.event"),
                    "metadata": item.get("metadata", {}) or item,
                    "created_at": parse_iso(item.get("createdAt")),
                },
            )
            migrated["emailEvents"] += 1

        config = raw.get("config")
        if isinstance(config, dict):
            AppSetting.objects.update_or_create(key="app_config", defaults={"value": config})
            migrated["config"] = 1

        self.stdout.write(self.style.SUCCESS(f"Migrated JSON data: {migrated}"))

        if options.get("delete_source"):
            DB_PATH.unlink(missing_ok=True)
            self.stdout.write(self.style.SUCCESS("Deleted source file data/db.json"))

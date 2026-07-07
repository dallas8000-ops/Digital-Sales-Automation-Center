import json
import os
from uuid import uuid4

from django.core.management.base import BaseCommand, CommandError
from django.test import Client
from django.utils import timezone

from core.models import EmailJob, Prospect


class Command(BaseCommand):
    help = "Run legitimacy smoke tests for ingest and outbound compliance gates"

    def handle(self, *args, **options):
        api_key = os.getenv("ADMIN_API_KEY", "").strip() or "ci-smoke-key"
        os.environ["ADMIN_API_KEY"] = api_key
        os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "testserver,localhost,127.0.0.1")

        client = Client()
        headers = {"HTTP_X_API_KEY": api_key}

        compliant_id = f"smoke-compliant-{uuid4()}"
        blocked_id = f"smoke-blocked-{uuid4()}"
        compliant_job = f"smoke-job-compliant-{uuid4()}"
        blocked_job = f"smoke-job-blocked-{uuid4()}"

        Prospect.objects.update_or_create(
            id=compliant_id,
            defaults={
                "company": "Smoke Compliant Co",
                "email": "compliant@example.com",
                "verified_email": "compliant@example.com",
                "website": "https://example.com",
                "source_provider": "manual_verified_public_contact",
                "source_record_id": "smoke:1",
                "compliance_basis": "legitimate_interest",
                "compliance_verified_at": timezone.now(),
                "validation": {"email": {"valid": True}, "domain": {"valid": True}},
                "data_quality": {"isReal": True, "isVerified": True},
                "score": 80,
                "tier": "Hot",
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )

        Prospect.objects.update_or_create(
            id=blocked_id,
            defaults={
                "company": "Smoke Blocked Co",
                "email": "blocked@example.com",
                "verified_email": "blocked@example.com",
                "website": "https://example.org",
                "source_provider": "",
                "source_record_id": "",
                "compliance_basis": "",
                "compliance_verified_at": None,
                "validation": {"email": {"valid": True}, "domain": {"valid": True}},
                "data_quality": {"isReal": True, "isVerified": True},
                "score": 65,
                "tier": "Warm",
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )

        EmailJob.objects.update_or_create(
            id=compliant_job,
            defaults={
                "job_type": "outreach",
                "to_email": "compliant@example.com",
                "status": "pending",
                "payload": {"prospectId": compliant_id},
                "available_at": timezone.now(),
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )

        EmailJob.objects.update_or_create(
            id=blocked_job,
            defaults={
                "job_type": "outreach",
                "to_email": "blocked@example.com",
                "status": "pending",
                "payload": {"prospectId": blocked_id},
                "available_at": timezone.now(),
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )

        health = client.get("/api/health")
        if health.status_code != 200:
            raise CommandError(f"health failed: {health.status_code}")

        bad_prospect = client.post(
            "/api/prospects",
            data=json.dumps({"company": "No Compliance", "email": "noc@realco.co", "website": "realco.co"}),
            content_type="application/json",
            **headers,
        )
        if bad_prospect.status_code != 400:
            raise CommandError(f"expected 400 prospect compliance rejection, got {bad_prospect.status_code}")

        max_attempts = 25
        for attempt in range(max_attempts):
            process = client.post("/api/email-jobs/process", data=json.dumps({"limit": 50}), content_type="application/json", **headers)
            if process.status_code != 200:
                raise CommandError(f"email process failed on attempt {attempt + 1}: {process.status_code}")

            compliant = EmailJob.objects.get(id=compliant_job)
            blocked = EmailJob.objects.get(id=blocked_job)
            if compliant.status != "pending" and blocked.status != "pending":
                break

        compliant = EmailJob.objects.get(id=compliant_job)
        blocked = EmailJob.objects.get(id=blocked_job)
        if compliant.status != "sent":
            raise CommandError(f"compliant job not sent: {compliant.status}")
        if blocked.status != "blocked_compliance":
            raise CommandError(f"blocked job status mismatch: {blocked.status}")

        self.stdout.write(self.style.SUCCESS("Legitimacy smoke tests passed"))

        Prospect.objects.filter(id__in=[compliant_id, blocked_id]).delete()
        EmailJob.objects.filter(id__in=[compliant_job, blocked_job]).delete()

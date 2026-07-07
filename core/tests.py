import json
import os
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from .models import ApiToken, Campaign, EmailJob, Prospect


class LegitimacyFlowTests(TestCase):
	def setUp(self):
		os.environ["ADMIN_API_KEY"] = "test-admin-key"
		self.headers = {"HTTP_X_API_KEY": "test-admin-key"}

	def test_prospect_create_requires_compliance_fields(self):
		response = self.client.post(
			"/api/prospects",
			data=json.dumps({"company": "Real Co", "email": "contact@realco.com", "website": "realco.com"}),
			content_type="application/json",
			**self.headers,
		)
		self.assertEqual(response.status_code, 400)
		self.assertIn("complianceBasis", response.content.decode("utf-8"))

	def test_email_process_blocks_noncompliant_prospect_job(self):
		prospect = Prospect.objects.create(
			id="test-prospect-blocked",
			company="Blocked Co",
			email="blocked@example.com",
			verified_email="blocked@example.com",
			website="https://example.com",
			source_provider="",
			source_record_id="",
			compliance_basis="",
			compliance_verified_at=None,
			validation={"email": {"valid": True}, "domain": {"valid": True}},
			data_quality={"isReal": True, "isVerified": True},
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)
		EmailJob.objects.create(
			id="test-job-blocked",
			job_type="outreach",
			to_email="blocked@example.com",
			status="pending",
			payload={"prospectId": prospect.id},
			available_at=timezone.now(),
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)

		response = self.client.post(
			"/api/email-jobs/process",
			data=json.dumps({"limit": 10}),
			content_type="application/json",
			**self.headers,
		)
		self.assertEqual(response.status_code, 200)

		job = EmailJob.objects.get(id="test-job-blocked")
		self.assertEqual(job.status, "blocked_compliance")

	def test_email_process_sends_compliant_prospect_job(self):
		prospect = Prospect.objects.create(
			id="test-prospect-compliant",
			company="Compliant Co",
			email="compliant@example.com",
			verified_email="compliant@example.com",
			website="https://example.org",
			source_provider="manual_verified_public_contact",
			source_record_id="record-1",
			compliance_basis="legitimate_interest",
			compliance_verified_at=timezone.now(),
			validation={"email": {"valid": True}, "domain": {"valid": True}},
			data_quality={"isReal": True, "isVerified": True},
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)
		EmailJob.objects.create(
			id="test-job-compliant",
			job_type="outreach",
			to_email="compliant@example.com",
			status="pending",
			payload={"prospectId": prospect.id},
			available_at=timezone.now(),
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)

		response = self.client.post(
			"/api/email-jobs/process",
			data=json.dumps({"limit": 10}),
			content_type="application/json",
			**self.headers,
		)
		self.assertEqual(response.status_code, 200)

		job = EmailJob.objects.get(id="test-job-compliant")
		self.assertEqual(job.status, "sent")


class AuthScopeTests(TestCase):
	def setUp(self):
		os.environ["ADMIN_API_KEY"] = "test-admin-key"
		self.admin_headers = {"HTTP_X_API_KEY": "test-admin-key"}
		ApiToken.objects.create(name="outreach-token", token="outreach-1", role=ApiToken.Role.OUTREACH, is_active=True)

	def test_prospects_requires_auth(self):
		response = self.client.get("/api/prospects")
		self.assertEqual(response.status_code, 401)

	def test_outreach_token_cannot_create_prospect(self):
		response = self.client.post(
			"/api/prospects",
			data=json.dumps({"company": "Real Co", "email": "contact@realco.com"}),
			content_type="application/json",
			HTTP_X_API_KEY="outreach-1",
		)
		self.assertEqual(response.status_code, 403)

	def test_outreach_token_can_process_email_jobs(self):
		response = self.client.post(
			"/api/email-jobs/process",
			data=json.dumps({"limit": 1}),
			content_type="application/json",
			HTTP_X_API_KEY="outreach-1",
		)
		self.assertEqual(response.status_code, 200)


class IdempotencyAndRetryTests(TestCase):
	def setUp(self):
		os.environ["ADMIN_API_KEY"] = "test-admin-key"
		os.environ["HUNTER_API_KEY"] = "test-hunter-key"
		self.headers = {"HTTP_X_API_KEY": "test-admin-key", "HTTP_IDEMPOTENCY_KEY": "idem-1"}

	@patch("core.views.validate_domain_hunter")
	@patch("core.views.validate_email_hunter")
	def test_prospect_post_idempotency_replay_and_conflict(self, mock_validate_email, mock_validate_domain):
		mock_validate_email.return_value = {"email": "contact@realco.com", "valid": True, "score": 100, "sources": []}
		mock_validate_domain.return_value = {"domain": "realco.com", "valid": True, "reason": "Domain found"}

		payload = {
			"company": "Real Co",
			"email": "contact@realco.com",
			"website": "realco.com",
			"sourceProvider": "manual_verified_public_contact",
			"sourceRecordId": "realco:1",
			"complianceBasis": "legitimate_interest",
		}

		first = self.client.post("/api/prospects", data=json.dumps(payload), content_type="application/json", **self.headers)
		self.assertEqual(first.status_code, 201)

		second = self.client.post("/api/prospects", data=json.dumps(payload), content_type="application/json", **self.headers)
		self.assertEqual(second.status_code, 201)
		self.assertEqual(first.json()["id"], second.json()["id"])
		self.assertEqual(Prospect.objects.filter(company="Real Co", email="contact@realco.com").count(), 1)

		conflict_payload = {**payload, "company": "Real Co Updated"}
		conflict = self.client.post("/api/prospects", data=json.dumps(conflict_payload), content_type="application/json", **self.headers)
		self.assertEqual(conflict.status_code, 409)

	def test_email_retry_schedules_next_attempt_on_transient_error(self):
		prospect = Prospect.objects.create(
			id="retry-prospect",
			company="Retry Co",
			email="retry@example.com",
			verified_email="retry@example.com",
			website="https://retry.example.com",
			source_provider="manual_verified_public_contact",
			source_record_id="retry:1",
			compliance_basis="legitimate_interest",
			compliance_verified_at=timezone.now(),
			validation={"email": {"valid": True}, "domain": {"valid": True}},
			data_quality={"isReal": True, "isVerified": True},
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)
		job = EmailJob.objects.create(
			id="retry-job",
			job_type="outreach",
			to_email="retry@example.com",
			status="pending",
			payload={"prospectId": prospect.id},
			available_at=timezone.now(),
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)

		before = timezone.now()
		with patch("core.views.build_unsubscribe_url", side_effect=RuntimeError("smtp temp outage")):
			response = self.client.post(
				"/api/email-jobs/process",
				data=json.dumps({"limit": 10}),
				content_type="application/json",
				HTTP_X_API_KEY="test-admin-key",
			)

		self.assertEqual(response.status_code, 200)
		job.refresh_from_db()
		self.assertEqual(job.status, "pending")
		self.assertEqual(job.retry_count, 1)
		self.assertIn("smtp temp outage", job.last_error)
		self.assertGreaterEqual(job.available_at, before + timedelta(minutes=5))

	def test_email_process_skips_future_available_jobs(self):
		future_job = EmailJob.objects.create(
			id="future-job",
			job_type="outreach",
			to_email="future@example.com",
			status="pending",
			payload={"prospectId": "missing"},
			available_at=timezone.now() + timedelta(hours=1),
			created_at=timezone.now(),
			updated_at=timezone.now(),
		)

		response = self.client.post(
			"/api/email-jobs/process",
			data=json.dumps({"limit": 10}),
			content_type="application/json",
			HTTP_X_API_KEY="test-admin-key",
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()["processed"], 0)
		future_job.refresh_from_db()
		self.assertEqual(future_job.status, "pending")

	def test_campaign_create_idempotency_replay(self):
		headers = {"HTTP_IDEMPOTENCY_KEY": "camp-idem-1"}
		payload = {"name": "Legit Campaign", "status": "draft"}

		first = self.client.post("/api/campaigns", data=json.dumps(payload), content_type="application/json", **headers)
		second = self.client.post("/api/campaigns", data=json.dumps(payload), content_type="application/json", **headers)

		self.assertEqual(first.status_code, 201)
		self.assertEqual(second.status_code, 201)
		self.assertEqual(first.json()["id"], second.json()["id"])
		self.assertEqual(Campaign.objects.filter(name="Legit Campaign").count(), 1)

from django.db import models
from django.utils import timezone


class AppSetting(models.Model):
	key = models.CharField(max_length=120, unique=True)
	value = models.JSONField(default=dict)
	updated_at = models.DateTimeField(auto_now=True)


class Product(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	name = models.CharField(max_length=255)
	category = models.CharField(max_length=120, blank=True, default="")
	price_from = models.FloatField(default=0)
	description = models.TextField(blank=True, default="")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class Prospect(models.Model):
	class FollowUpStatus(models.TextChoices):
		NOT_STARTED = "not_started", "Not started"
		OUTREACH_SENT = "outreach_sent", "Outreach sent"
		FOLLOW_UP_SCHEDULED = "follow_up_scheduled", "Follow-up scheduled"
		IN_CONVERSATION = "in_conversation", "In conversation"
		WON = "won", "Won"
		LOST = "lost", "Lost"

	class ComplianceBasis(models.TextChoices):
		CONSENT = "consent", "Consent"
		LEGITIMATE_INTEREST = "legitimate_interest", "Legitimate interest"
		CONTRACTUAL_NECESSITY = "contractual_necessity", "Contractual necessity"

	id = models.CharField(primary_key=True, max_length=120)
	company = models.CharField(max_length=255)
	first_name = models.CharField(max_length=120, blank=True, default="")
	last_name = models.CharField(max_length=120, blank=True, default="")
	email = models.EmailField(max_length=320)
	verified_email = models.EmailField(max_length=320, blank=True, default="")
	website = models.CharField(max_length=500, blank=True, default="")
	linkedin_url = models.URLField(max_length=500, blank=True, default="")
	source_provider = models.CharField(max_length=120, blank=True, default="")
	source_record_id = models.CharField(max_length=255, blank=True, default="")
	compliance_basis = models.CharField(max_length=60, choices=ComplianceBasis.choices, blank=True, default="")
	compliance_verified_at = models.DateTimeField(null=True, blank=True)
	title = models.CharField(max_length=255, blank=True, default="")
	industry = models.CharField(max_length=120, blank=True, default="")
	country = models.CharField(max_length=120, blank=True, default="")
	why_fit = models.TextField(blank=True, default="")
	matched_product = models.ForeignKey("Product", on_delete=models.SET_NULL, null=True, blank=True, related_name="matched_prospects")
	email_campaign = models.ForeignKey("Campaign", on_delete=models.SET_NULL, null=True, blank=True, related_name="target_prospects")
	follow_up_status = models.CharField(
		max_length=40,
		choices=FollowUpStatus.choices,
		default=FollowUpStatus.NOT_STARTED,
	)
	status = models.CharField(max_length=60, blank=True, default="new")
	stage = models.CharField(max_length=60, blank=True, default="lead")
	engagement_level = models.IntegerField(default=0)
	recommended_product = models.CharField(max_length=255, blank=True, default="")
	data_quality = models.JSONField(default=dict)
	validation = models.JSONField(default=dict)
	score = models.IntegerField(default=30)
	tier = models.CharField(max_length=30, blank=True, default="Cold")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)

	class Meta:
		indexes = [
			models.Index(fields=["country", "industry"], name="prospect_country_industry_idx"),
			models.Index(fields=["follow_up_status", "tier"], name="prospect_followup_tier_idx"),
			models.Index(fields=["email_campaign", "score"], name="prospect_campaign_score_idx"),
		]


class ProspectContact(models.Model):
	class Role(models.TextChoices):
		CTO = "cto", "CTO"
		CEO = "ceo", "CEO"
		HEAD_OF_ENGINEERING = "head_of_engineering", "Head of Engineering"
		PRODUCT_DIRECTOR = "product_director", "Product Director"
		PARTNERSHIP_MANAGER = "partnership_manager", "Partnership Manager"
		BUSINESS_DEVELOPMENT_DIRECTOR = "business_development_director", "Business Development Director"

	prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="contacts")
	role = models.CharField(max_length=60, choices=Role.choices)
	full_name = models.CharField(max_length=255, blank=True, default="")
	email = models.EmailField(max_length=320, blank=True, default="")
	is_email_verified = models.BooleanField(default=False)
	linkedin_url = models.URLField(max_length=500, blank=True, default="")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)

	class Meta:
		constraints = [models.UniqueConstraint(fields=["prospect", "role"], name="uniq_prospect_contact_role")]


class Activity(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	type = models.CharField(max_length=120)
	message = models.TextField(blank=True, default="")
	metadata = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class EmailJob(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	job_type = models.CharField(max_length=120, blank=True, default="")
	to_email = models.CharField(max_length=320, blank=True, default="")
	status = models.CharField(max_length=80, blank=True, default="pending")
	payload = models.JSONField(default=dict)
	idempotency_key = models.CharField(max_length=255, blank=True, default="")
	retry_count = models.IntegerField(default=0)
	max_retries = models.IntegerField(default=3)
	available_at = models.DateTimeField(default=timezone.now)
	last_error = models.TextField(blank=True, default="")
	processed_at = models.DateTimeField(null=True, blank=True)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)

	class Meta:
		indexes = [
			models.Index(fields=["status", "available_at"], name="emailjob_status_available_idx"),
		]
		constraints = [
			models.UniqueConstraint(fields=["idempotency_key"], name="uniq_emailjob_idempotency", condition=~models.Q(idempotency_key="")),
		]


class EmailEvent(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	event_type = models.CharField(max_length=120)
	job = models.ForeignKey(EmailJob, on_delete=models.SET_NULL, null=True, blank=True)
	metadata = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)


class Campaign(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	name = models.CharField(max_length=255)
	subject_template = models.TextField(blank=True, default="")
	body_template = models.TextField(blank=True, default="")
	status = models.CharField(max_length=40, blank=True, default="draft")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class CampaignTarget(models.Model):
	campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="targets")
	company = models.CharField(max_length=255)
	country = models.CharField(max_length=120, blank=True, default="")
	industry = models.CharField(max_length=120, blank=True, default="")
	website = models.CharField(max_length=500, blank=True, default="")
	public_contact_email = models.EmailField(max_length=320, blank=True, default="")
	fit_notes = models.TextField(blank=True, default="")
	matched_products = models.JSONField(default=list)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)

	class Meta:
		constraints = [models.UniqueConstraint(fields=["campaign", "company"], name="uniq_campaign_target_company")]


class SuppressionList(models.Model):
	email = models.EmailField(max_length=320, unique=True)
	reason = models.CharField(max_length=120, blank=True, default="unsubscribe")
	source = models.CharField(max_length=120, blank=True, default="recipient")
	unsubscribe_token = models.CharField(max_length=512, blank=True, default="")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class ApiToken(models.Model):
	class Role(models.TextChoices):
		ADMIN = "admin", "Admin"
		ANALYST = "analyst", "Analyst"
		OUTREACH = "outreach", "Outreach"
		READ_ONLY = "read_only", "Read only"

	name = models.CharField(max_length=120)
	token = models.CharField(max_length=255, unique=True)
	role = models.CharField(max_length=40, choices=Role.choices, default=Role.READ_ONLY)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class IdempotencyKey(models.Model):
	key = models.CharField(max_length=255, unique=True)
	endpoint = models.CharField(max_length=120)
	request_hash = models.CharField(max_length=64)
	response_code = models.IntegerField(default=200)
	response_body = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class AuditEvent(models.Model):
	event_type = models.CharField(max_length=120)
	actor = models.CharField(max_length=255, blank=True, default="system")
	resource_type = models.CharField(max_length=120, blank=True, default="")
	resource_id = models.CharField(max_length=255, blank=True, default="")
	metadata = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)

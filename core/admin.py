from django.contrib import admin

from .models import Activity, ApiToken, AppSetting, AuditEvent, Campaign, CampaignTarget, EmailEvent, EmailJob, IdempotencyKey, Product, Prospect, ProspectContact, SuppressionList


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
	list_display = ("key", "updated_at")
	search_fields = ("key",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
	list_display = ("id", "name", "category", "price_from", "updated_at")
	search_fields = ("id", "name", "category")


class ProspectContactInline(admin.TabularInline):
	model = ProspectContact
	extra = 0
	fields = ("role", "full_name", "email", "is_email_verified", "linkedin_url", "updated_at")
	readonly_fields = ("updated_at",)


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
	list_display = (
		"company",
		"country",
		"industry",
		"verified_email",
		"compliance_basis",
		"source_provider",
		"follow_up_status",
		"matched_product",
		"email_campaign",
		"score",
		"tier",
		"updated_at",
	)
	list_filter = ("country", "industry", "compliance_basis", "follow_up_status", "tier", "matched_product", "email_campaign")
	search_fields = ("company", "email", "verified_email", "website", "linkedin_url", "why_fit", "source_provider", "source_record_id")
	inlines = [ProspectContactInline]


@admin.register(ProspectContact)
class ProspectContactAdmin(admin.ModelAdmin):
	list_display = ("prospect", "role", "full_name", "email", "is_email_verified", "updated_at")
	list_filter = ("role", "is_email_verified")
	search_fields = ("prospect__company", "full_name", "email", "linkedin_url")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
	list_display = ("id", "type", "created_at", "updated_at")
	search_fields = ("type", "message")


@admin.register(EmailJob)
class EmailJobAdmin(admin.ModelAdmin):
	list_display = ("id", "job_type", "to_email", "status", "retry_count", "processed_at", "updated_at")
	list_filter = ("status", "job_type")
	search_fields = ("id", "to_email", "job_type")


@admin.register(EmailEvent)
class EmailEventAdmin(admin.ModelAdmin):
	list_display = ("id", "event_type", "job", "created_at")
	list_filter = ("event_type",)
	search_fields = ("id", "event_type", "job__id")


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
	list_display = ("id", "name", "status", "updated_at")
	list_filter = ("status",)
	search_fields = ("id", "name")


@admin.register(CampaignTarget)
class CampaignTargetAdmin(admin.ModelAdmin):
	list_display = ("campaign", "company", "public_contact_email", "country", "industry", "updated_at")
	list_filter = ("campaign", "country", "industry")
	search_fields = ("company", "campaign__name", "website", "public_contact_email")


@admin.register(SuppressionList)
class SuppressionListAdmin(admin.ModelAdmin):
	list_display = ("email", "reason", "source", "updated_at")
	list_filter = ("reason", "source")
	search_fields = ("email",)


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
	list_display = ("name", "role", "is_active", "updated_at")
	list_filter = ("role", "is_active")
	search_fields = ("name", "token")


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
	list_display = ("key", "endpoint", "response_code", "updated_at")
	search_fields = ("key", "endpoint", "request_hash")


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
	list_display = ("event_type", "actor", "resource_type", "resource_id", "created_at")
	list_filter = ("event_type", "resource_type")
	search_fields = ("actor", "resource_id")

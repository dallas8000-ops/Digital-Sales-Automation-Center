from django.contrib import admin
from .models import Prospect


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
    list_display = ['email', 'firstName', 'lastName', 'company', 'verification_status', 'score', 'created_at']
    list_filter = ['emailVerified', 'domainVerified', 'created_at', 'industry']
    search_fields = ['email', 'firstName', 'lastName', 'company']
    readonly_fields = ['created_at', 'updated_at', 'last_verified']
    fieldsets = (
        ('Contact Info', {
            'fields': ('email', 'firstName', 'lastName', 'company', 'domain', 'phone', 'website')
        }),
        ('Details', {
            'fields': ('industry', 'location', 'score', 'recommendedProduct', 'source')
        }),
        ('Validation', {
            'fields': ('validation', 'emailVerified', 'domainVerified', 'last_verified')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at')
        }),
    )

from django.contrib import admin
from .models import EmailJob, EmailEvent, SuppressionList


@admin.register(EmailJob)
class EmailJobAdmin(admin.ModelAdmin):
    list_display = ['to_email', 'subject', 'status', 'created_at', 'sent_at']
    list_filter = ['status', 'created_at', 'sent_at']
    search_fields = ['to_email', 'subject', 'prospect__email']
    readonly_fields = ['created_at', 'sent_at']
    fieldsets = (
        ('Email', {
            'fields': ('prospect', 'to_email', 'subject', 'body', 'html_body')
        }),
        ('Compliance', {
            'fields': ('unsubscribe_link', 'sender_address')
        }),
        ('Status', {
            'fields': ('status', 'created_at', 'sent_at', 'failed_reason')
        }),
        ('Metadata', {
            'fields': ('metadata',)
        }),
    )


@admin.register(EmailEvent)
class EmailEventAdmin(admin.ModelAdmin):
    list_display = ['email_job', 'event_type', 'timestamp', 'is_simulated']
    list_filter = ['event_type', 'is_simulated', 'timestamp']
    search_fields = ['email_job__to_email']
    readonly_fields = ['timestamp']


@admin.register(SuppressionList)
class SuppressionListAdmin(admin.ModelAdmin):
    list_display = ['email', 'reason', 'added_at']
    list_filter = ['reason', 'added_at']
    search_fields = ['email']
    readonly_fields = ['added_at']

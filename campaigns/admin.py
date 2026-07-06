from django.contrib import admin
from .models import Campaign, EmailSequence


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'total_sent', 'total_opened', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name']
    filter_horizontal = ['prospects']
    readonly_fields = ['created_at', 'updated_at', 'total_sent', 'total_opened', 'total_clicked', 'total_bounced']


@admin.register(EmailSequence)
class EmailSequenceAdmin(admin.ModelAdmin):
    list_display = ['campaign', 'order', 'name', 'subject']
    list_filter = ['campaign', 'order']
    search_fields = ['name', 'subject']
    readonly_fields = ['created_at', 'updated_at']

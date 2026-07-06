from django.db import models
from django.contrib.postgres.fields import JSONField
from prospects.models import Prospect


class Campaign(models.Model):
    """Model for email campaigns."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('running', 'Running'),
        ('paused', 'Paused'),
        ('completed', 'Completed'),
        ('archived', 'Archived'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Recipients
    prospects = models.ManyToManyField(Prospect, related_name='campaigns')
    
    # Configuration
    send_rate_limit = models.IntegerField(default=50, help_text='Max emails per day')
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    
    # Tracking
    total_sent = models.IntegerField(default=0)
    total_opened = models.IntegerField(default=0)
    total_clicked = models.IntegerField(default=0)
    total_bounced = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class EmailSequence(models.Model):
    """Model for email sequences/templates within campaigns."""
    
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='sequences')
    order = models.IntegerField(default=0, help_text='Sequence order')
    
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    html_body = models.TextField(null=True, blank=True)
    
    # Timing
    delay_hours = models.IntegerField(default=0, help_text='Hours after previous email to send')
    
    # Compliance
    unsubscribe_link = models.URLField(null=True, blank=True)
    sender_address = models.CharField(max_length=255, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['campaign', 'order']
        unique_together = [['campaign', 'order']]
    
    def __str__(self):
        return f"{self.campaign.name} - {self.name}"

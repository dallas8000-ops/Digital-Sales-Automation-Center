from django.db import models
from django.contrib.postgres.fields import JSONField
from prospects.models import Prospect


class EmailJob(models.Model):
    """Model for email sending jobs."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('bounced', 'Bounced'),
    ]
    
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name='email_jobs')
    to_email = models.EmailField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    html_body = models.TextField(null=True, blank=True)
    
    # Compliance
    unsubscribe_link = models.URLField(null=True, blank=True)
    sender_address = models.CharField(max_length=255, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    failed_reason = models.TextField(null=True, blank=True)
    metadata = JSONField(default=dict, blank=True)  # Stores delivery info, open tracking, etc.
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['prospect', 'status']),
        ]
    
    def __str__(self):
        return f"Email to {self.to_email} - {self.status}"


class EmailEvent(models.Model):
    """Model for email delivery events (sent, opened, bounced, complained)."""
    
    EVENT_CHOICES = [
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('opened', 'Opened'),
        ('clicked', 'Clicked'),
        ('bounced', 'Bounced'),
        ('complained', 'Complained'),
        ('unsubscribed', 'Unsubscribed'),
        ('simulated', 'Simulated'),  # For test mode tracking
    ]
    
    email_job = models.ForeignKey(EmailJob, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = JSONField(default=dict, blank=True)  # Bounce reason, open info, etc.
    is_simulated = models.BooleanField(default=False, help_text='[SIMULATED] for test mode tracking')
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['event_type', 'timestamp']),
            models.Index(fields=['is_simulated']),
        ]
    
    def __str__(self):
        simulated_tag = '[SIMULATED] ' if self.is_simulated else ''
        return f"{simulated_tag}{self.event_type.upper()} - {self.email_job.to_email}"


class SuppressionList(models.Model):
    """Model for tracking unsubscribes and hard bounces."""
    
    REASON_CHOICES = [
        ('unsubscribed', 'Unsubscribed'),
        ('hard_bounce', 'Hard Bounce'),
        ('complaint', 'Complaint'),
        ('manual', 'Manual Suppression'),
    ]
    
    email = models.EmailField(unique=True)
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    added_at = models.DateTimeField(auto_now_add=True)
    prospect = models.ForeignKey(Prospect, on_delete=models.SET_NULL, null=True, blank=True)
    metadata = JSONField(default=dict, blank=True)
    
    class Meta:
        ordering = ['-added_at']
        indexes = [
            models.Index(fields=['email']),
        ]
    
    def __str__(self):
        return f"{self.email} ({self.reason})"

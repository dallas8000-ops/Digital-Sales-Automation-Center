from django.db import models
from django.utils import timezone
from django.contrib.postgres.fields import JSONField

class Prospect(models.Model):
    """Model for sales prospects with validation tracking."""
    
    email = models.EmailField(unique=True)
    firstName = models.CharField(max_length=100)
    lastName = models.CharField(max_length=100, null=True, blank=True)
    company = models.CharField(max_length=200)
    domain = models.CharField(max_length=255, null=True, blank=True)
    industry = models.CharField(max_length=100, null=True, blank=True)
    website = models.URLField(null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)
    
    # Validation tracking
    validation = JSONField(default=dict, blank=True)  # Stores {email: {...}, domain: {...}}
    emailVerified = models.BooleanField(default=False)
    domainVerified = models.BooleanField(default=False)
    
    # Scoring and campaign tracking
    score = models.IntegerField(default=0)
    recommendedProduct = models.CharField(max_length=200, null=True, blank=True)
    source = models.CharField(max_length=100, default='manual', help_text='Where prospect came from (manual, hunter, api)')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_verified = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['company']),
            models.Index(fields=['emailVerified', 'domainVerified']),
        ]
    
    def __str__(self):
        return f"{self.firstName} {self.lastName} - {self.email}"
    
    @property
    def verification_status(self):
        """Returns verification status badge."""
        if self.emailVerified and self.domainVerified:
            return 'verified'
        elif self.emailVerified or self.domainVerified:
            return 'pending'
        return 'unverified'

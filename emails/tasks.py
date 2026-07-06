from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from django.conf import settings
from .models import EmailJob, EmailEvent, SuppressionList
from prospects.models import Prospect


@shared_task
def send_email_job(email_job_id):
    """
    Async task to send an email job via SMTP.
    """
    try:
        job = EmailJob.objects.get(id=email_job_id)
        
        # Check suppression list
        if SuppressionList.objects.filter(email=job.to_email).exists():
            job.status = 'bounced'
            job.failed_reason = 'Email on suppression list'
            job.save()
            
            EmailEvent.objects.create(
                email_job=job,
                event_type='bounced',
                metadata={'reason': 'suppression_list'}
            )
            return
        
        # Build email
        email = EmailMultiAlternatives(
            subject=job.subject,
            body=job.body,
            from_email=job.sender_address or settings.DEFAULT_FROM_EMAIL,
            to=[job.to_email]
        )
        
        if job.html_body:
            email.attach_alternative(job.html_body, "text/html")
        
        # Send
        job.status = 'sending'
        job.save()
        
        email.send(fail_silently=False)
        
        job.status = 'sent'
        job.sent_at = timezone.now()
        job.save()
        
        # Log event
        EmailEvent.objects.create(
            email_job=job,
            event_type='sent'
        )
        
    except Exception as e:
        job.status = 'failed'
        job.failed_reason = str(e)
        job.save()
        
        EmailEvent.objects.create(
            email_job=job,
            event_type='bounced',
            metadata={'error': str(e)}
        )


@shared_task
def process_suppressed_emails():
    """
    Task to process email bounce events and add to suppression list.
    """
    bounced_events = EmailEvent.objects.filter(
        event_type__in=['bounced', 'complained', 'unsubscribed'],
        is_simulated=False
    ).select_related('email_job')
    
    for event in bounced_events:
        job = event.email_job
        
        # Determine reason
        reason_map = {
            'bounced': 'hard_bounce',
            'complained': 'complaint',
            'unsubscribed': 'unsubscribed'
        }
        reason = reason_map.get(event.event_type, 'manual')
        
        # Add to suppression list
        SuppressionList.objects.get_or_create(
            email=job.to_email,
            defaults={
                'reason': reason,
                'prospect': job.prospect,
                'metadata': event.metadata
            }
        )

from django.core.management.base import BaseCommand

from core.views import process_pending_email_jobs, run_automation_cycle


class Command(BaseCommand):
    help = (
        "Runs one full automation cycle: checks the inbox for replies, queues outreach "
        "and follow-up emails for eligible prospects, then sends whatever is pending. "
        "Intended to be invoked on a schedule (a Railway cron service), not manually."
    )

    def handle(self, *args, **options):
        run_summary = run_automation_cycle(mode="scheduled", actor="cron")
        self.stdout.write(
            self.style.SUCCESS(
                f"Automation run: queued {run_summary.get('outreachQueued', 0)} outreach, "
                f"{run_summary.get('followUpsQueued', 0)} follow-up(s), "
                f"detected {run_summary.get('repliedInquiriesReviewed', 0)} repl(y/ies)."
            )
        )

        process_summary = process_pending_email_jobs(requested_limit=500, actor="cron")
        self.stdout.write(
            self.style.SUCCESS(
                f"Email jobs processed: sent {process_summary.get('sent', 0)}, "
                f"failed {process_summary.get('failed', 0)}, "
                f"suppressed {process_summary.get('suppressed', 0)}, "
                f"blocked_compliance {process_summary.get('blockedCompliance', 0)}."
            )
        )

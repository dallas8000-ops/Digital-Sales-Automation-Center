from django.urls import path

from . import views


urlpatterns = [
    path("api/health", views.api_health),
    path("api/config", views.api_config),
    path("api/products", views.api_products),
    path("api/prospects", views.api_prospects),
    path("api/prospects/query", views.api_prospects_query),
    path("api/prospects/possible-clients", views.api_prospects_possible_clients),
    path("api/prospects/export.csv", views.api_prospects_export_csv),
    path("api/integrations/status", views.api_integrations_status),
    path("api/email-jobs", views.api_email_jobs),
    path("api/email-jobs/process", views.api_email_jobs_process),
    path("api/ai/automation/status", views.api_ai_automation_status),
    path("api/ai/automation/settings", views.api_ai_automation_settings),
    path("api/ai/automation/run", views.api_ai_automation_run),
    path("api/ai/pipeline-recommendations", views.api_ai_pipeline_recommendations),
    path("api/discovery/bulk-prospects", views.api_discovery_bulk_prospects),
    path("api/discovery/tech-detect", views.api_discovery_tech_detect),
    path("api/sales-package/assets", views.api_sales_assets),
    path("api/sales-package/calendar", views.api_sales_calendar),
    path("api/sales-package/sequence", views.api_sales_sequence),
    path("", views.serve_public_page),
    path("<path:page>", views.serve_public_page),
]

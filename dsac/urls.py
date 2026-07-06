"""
URL configuration for dsac project.
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/prospects/', include('prospects.urls')),
    path('api/campaigns/', include('campaigns.urls')),
    path('api/emails/', include('emails.urls')),
    path('api/payments/', include('payments.urls')),
    path('health/', include('django.contrib.auth.urls')),
    
    # Serve HTML files
    path('', TemplateView.as_view(template_name='index.html')),
    path('automation.html', TemplateView.as_view(template_name='automation.html')),
    path('campaigns.html', TemplateView.as_view(template_name='campaigns.html')),
    path('prospects.html', TemplateView.as_view(template_name='prospects.html')),
    path('inbox.html', TemplateView.as_view(template_name='inbox.html')),
    path('scheduling.html', TemplateView.as_view(template_name='scheduling.html')),
    path('analytics.html', TemplateView.as_view(template_name='analytics.html')),
    path('proposals.html', TemplateView.as_view(template_name='proposals.html')),
    path('settings.html', TemplateView.as_view(template_name='settings.html')),
    path('pricing.html', TemplateView.as_view(template_name='pricing.html')),
    path('account.html', TemplateView.as_view(template_name='account.html')),
    path('success.html', TemplateView.as_view(template_name='success.html')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

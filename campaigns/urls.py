from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.CampaignViewSet, basename='campaign')
router.register(r'sequences', views.EmailSequenceViewSet, basename='sequence')

urlpatterns = [
    path('', include(router.urls)),
]

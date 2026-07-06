"""
Digital Sales Automation Center - Django project
"""
from .celery import app as celery_app

__all__ = ('celery_app',)

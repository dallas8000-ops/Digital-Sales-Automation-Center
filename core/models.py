from django.db import models
from django.utils import timezone


class AppSetting(models.Model):
	key = models.CharField(max_length=120, unique=True)
	value = models.JSONField(default=dict)
	updated_at = models.DateTimeField(auto_now=True)


class Product(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	name = models.CharField(max_length=255)
	category = models.CharField(max_length=120, blank=True, default="")
	price_from = models.FloatField(default=0)
	description = models.TextField(blank=True, default="")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class Prospect(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	company = models.CharField(max_length=255)
	first_name = models.CharField(max_length=120, blank=True, default="")
	last_name = models.CharField(max_length=120, blank=True, default="")
	email = models.EmailField(max_length=320)
	website = models.CharField(max_length=500, blank=True, default="")
	title = models.CharField(max_length=255, blank=True, default="")
	industry = models.CharField(max_length=120, blank=True, default="")
	country = models.CharField(max_length=120, blank=True, default="")
	status = models.CharField(max_length=60, blank=True, default="new")
	stage = models.CharField(max_length=60, blank=True, default="lead")
	engagement_level = models.IntegerField(default=0)
	recommended_product = models.CharField(max_length=255, blank=True, default="")
	data_quality = models.JSONField(default=dict)
	validation = models.JSONField(default=dict)
	score = models.IntegerField(default=30)
	tier = models.CharField(max_length=30, blank=True, default="Cold")
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class Activity(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	type = models.CharField(max_length=120)
	message = models.TextField(blank=True, default="")
	metadata = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class EmailJob(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	job_type = models.CharField(max_length=120, blank=True, default="")
	to_email = models.CharField(max_length=320, blank=True, default="")
	status = models.CharField(max_length=80, blank=True, default="pending")
	payload = models.JSONField(default=dict)
	processed_at = models.DateTimeField(null=True, blank=True)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(default=timezone.now)


class EmailEvent(models.Model):
	id = models.CharField(primary_key=True, max_length=120)
	event_type = models.CharField(max_length=120)
	job = models.ForeignKey(EmailJob, on_delete=models.SET_NULL, null=True, blank=True)
	metadata = models.JSONField(default=dict)
	created_at = models.DateTimeField(default=timezone.now)

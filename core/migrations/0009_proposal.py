# Generated for Proposal model (client subscription plans / Stripe checkout)

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_apitoken_auditevent_idempotencykey_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Proposal',
            fields=[
                ('id', models.CharField(max_length=120, primary_key=True, serialize=False)),
                ('company', models.CharField(max_length=255)),
                ('contact', models.CharField(blank=True, default='', max_length=255)),
                ('monthly_fee', models.FloatField(default=0)),
                ('scope', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('draft', 'Draft (Stripe not configured)'), ('checkout_ready', 'Checkout link ready'), ('error', 'Stripe error')], default='draft', max_length=30)),
                ('stripe_checkout_url', models.URLField(blank=True, default='', max_length=1000)),
                ('stripe_checkout_session_id', models.CharField(blank=True, default='', max_length=255)),
                ('stripe_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='proposals', to='core.product')),
                ('prospect', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='proposals', to='core.prospect')),
            ],
        ),
    ]

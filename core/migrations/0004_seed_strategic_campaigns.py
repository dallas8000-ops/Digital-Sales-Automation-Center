from django.db import migrations


CAMPAIGNS = [
    {
        "id": "camp-east-african-fintech",
        "name": "East African Fintech",
        "status": "active",
        "subject_template": "Scaling fintech operations across East Africa",
        "body_template": "Operational efficiency and compliance acceleration for regional fintech teams.",
    },
    {
        "id": "camp-eu-east-africa-ops",
        "name": "European Companies Operating in East Africa",
        "status": "active",
        "subject_template": "Regional fintech and API operations support",
        "body_template": "Support for Uganda, Kenya, Tanzania, and Rwanda operations with fintech + API transfer + DB ops.",
    },
    {
        "id": "camp-software-companies",
        "name": "Software Companies",
        "status": "active",
        "subject_template": "Deployment and payments automation for software teams",
        "body_template": "Improve release flow and recurring revenue operations with deployment and Stripe automation.",
    },
]

TARGETS = [
    {"campaign": "camp-east-african-fintech", "company": "Flutterwave", "country": "Kenya", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Pesapal", "country": "Kenya", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "MFS Africa", "country": "Kenya", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Cellulant", "country": "Kenya", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Asaak", "country": "Uganda", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Numida", "country": "Uganda", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Eversend", "country": "Uganda", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Chipper Cash", "country": "Uganda", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "DPO Group", "country": "Kenya", "industry": "FinTech"},
    {"campaign": "camp-east-african-fintech", "company": "Onafriq", "country": "Kenya", "industry": "FinTech"},
]


def seed_campaigns(apps, _schema_editor):
    Campaign = apps.get_model("core", "Campaign")
    CampaignTarget = apps.get_model("core", "CampaignTarget")

    for item in CAMPAIGNS:
        Campaign.objects.update_or_create(
            id=item["id"],
            defaults={
                "name": item["name"],
                "status": item["status"],
                "subject_template": item["subject_template"],
                "body_template": item["body_template"],
            },
        )

    for target in TARGETS:
        campaign = Campaign.objects.filter(id=target["campaign"]).first()
        if not campaign:
            continue
        CampaignTarget.objects.update_or_create(
            campaign=campaign,
            company=target["company"],
            defaults={
                "country": target["country"],
                "industry": target["industry"],
                "matched_products": ["Elite Fintech Systems"],
            },
        )


def unseed_campaigns(apps, _schema_editor):
    Campaign = apps.get_model("core", "Campaign")
    CampaignTarget = apps.get_model("core", "CampaignTarget")

    campaign_ids = [item["id"] for item in CAMPAIGNS]
    CampaignTarget.objects.filter(campaign__id__in=campaign_ids).delete()
    Campaign.objects.filter(id__in=campaign_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_prospect_email_campaign_prospect_follow_up_status_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_campaigns, unseed_campaigns),
    ]

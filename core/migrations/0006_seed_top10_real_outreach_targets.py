from django.db import migrations


CAMPAIGN = {
    "id": "camp-top-10-first-contact",
    "name": "Top 10 First Contact (Real Public Business Contacts)",
    "status": "active",
    "subject_template": "Partnership opportunity for fintech and software operations",
    "body_template": "Reaching out via publicly listed business contacts with relevant product fit context.",
}

TARGETS = [
    {
        "company": "Flutterwave",
        "country": "Kenya",
        "industry": "FinTech",
        "public_contact_email": "partnerships@flutterwavego.com",
        "fit_notes": "Payment infrastructure across Africa",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "Pesapal",
        "country": "Kenya",
        "industry": "FinTech",
        "public_contact_email": "hello@pesapal.com",
        "fit_notes": "Your fintech platform aligns well",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "Cellulant",
        "country": "Kenya",
        "industry": "FinTech",
        "public_contact_email": "info@cellulant.io",
        "fit_notes": "Enterprise payment solutions",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "MFS Africa",
        "country": "Kenya",
        "industry": "FinTech",
        "public_contact_email": "info@mfsafrica.com",
        "fit_notes": "Cross-border payments",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "Kobo360",
        "country": "Kenya",
        "industry": "Logistics Technology",
        "public_contact_email": "hello@kobo360.com",
        "fit_notes": "RigHand AI and logistics software",
        "matched_products": ["RigHand AI"],
    },
    {
        "company": "TradeMark Africa",
        "country": "Kenya",
        "industry": "Trade Logistics",
        "public_contact_email": "info@trademarkafrica.com",
        "fit_notes": "Digital trade and logistics",
        "matched_products": ["DBOps Control Center"],
    },
    {
        "company": "Logicom",
        "country": "Kenya",
        "industry": "Enterprise Software",
        "public_contact_email": "info@logicom.net",
        "fit_notes": "Enterprise software partnerships",
        "matched_products": ["Deployment & Stripe Automation Center"],
    },
    {
        "company": "Asaak",
        "country": "Uganda",
        "industry": "FinTech",
        "public_contact_email": "info@asaak.co",
        "fit_notes": "Lending and fintech platform",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "Numida",
        "country": "Uganda",
        "industry": "FinTech",
        "public_contact_email": "hello@numida.com",
        "fit_notes": "SME lending platform",
        "matched_products": ["Elite Fintech Systems"],
    },
    {
        "company": "SafeBoda",
        "country": "Uganda",
        "industry": "Mobility and Payments",
        "public_contact_email": "business@safeboda.com",
        "fit_notes": "Payments, logistics and operations",
        "matched_products": ["RigHand AI", "Deployment & Stripe Automation Center"],
    },
]


def seed_targets(apps, _schema_editor):
    Campaign = apps.get_model("core", "Campaign")
    CampaignTarget = apps.get_model("core", "CampaignTarget")

    campaign, _ = Campaign.objects.update_or_create(
        id=CAMPAIGN["id"],
        defaults={
            "name": CAMPAIGN["name"],
            "status": CAMPAIGN["status"],
            "subject_template": CAMPAIGN["subject_template"],
            "body_template": CAMPAIGN["body_template"],
        },
    )

    for target in TARGETS:
        CampaignTarget.objects.update_or_create(
            campaign=campaign,
            company=target["company"],
            defaults={
                "country": target["country"],
                "industry": target["industry"],
                "public_contact_email": target["public_contact_email"],
                "fit_notes": target["fit_notes"],
                "matched_products": target["matched_products"],
            },
        )


def unseed_targets(apps, _schema_editor):
    Campaign = apps.get_model("core", "Campaign")
    CampaignTarget = apps.get_model("core", "CampaignTarget")

    campaign = Campaign.objects.filter(id=CAMPAIGN["id"]).first()
    if not campaign:
        return
    CampaignTarget.objects.filter(campaign=campaign).delete()
    campaign.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_campaigntarget_public_contact_email"),
    ]

    operations = [
        migrations.RunPython(seed_targets, unseed_targets),
    ]

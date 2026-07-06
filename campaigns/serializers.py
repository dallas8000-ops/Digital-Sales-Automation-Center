from rest_framework import serializers
from .models import Campaign, EmailSequence


class EmailSequenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSequence
        fields = [
            'id', 'campaign', 'order', 'name', 'subject', 'body', 'html_body',
            'delay_hours', 'unsubscribe_link', 'sender_address', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CampaignSerializer(serializers.ModelSerializer):
    sequences = EmailSequenceSerializer(many=True, read_only=True)
    
    class Meta:
        model = Campaign
        fields = [
            'id', 'name', 'description', 'status', 'prospects', 'send_rate_limit',
            'start_date', 'end_date', 'total_sent', 'total_opened', 'total_clicked',
            'total_bounced', 'created_at', 'updated_at', 'sequences'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_sent', 'total_opened', 'total_clicked', 'total_bounced']

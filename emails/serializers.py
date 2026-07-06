from rest_framework import serializers
from .models import EmailJob, EmailEvent, SuppressionList


class EmailEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailEvent
        fields = ['id', 'event_type', 'timestamp', 'metadata', 'is_simulated']
        read_only_fields = ['timestamp']


class EmailJobSerializer(serializers.ModelSerializer):
    events = EmailEventSerializer(many=True, read_only=True)
    
    class Meta:
        model = EmailJob
        fields = [
            'id', 'prospect', 'to_email', 'subject', 'body', 'html_body',
            'unsubscribe_link', 'sender_address', 'status', 'created_at',
            'sent_at', 'failed_reason', 'metadata', 'events'
        ]
        read_only_fields = ['id', 'created_at', 'sent_at', 'events']


class SuppressionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuppressionList
        fields = ['id', 'email', 'reason', 'added_at', 'prospect', 'metadata']
        read_only_fields = ['id', 'added_at']

from rest_framework import serializers
from .models import Prospect

class ProspectSerializer(serializers.ModelSerializer):
    verification_status = serializers.CharField(read_only=True)
    
    class Meta:
        model = Prospect
        fields = [
            'id', 'email', 'firstName', 'lastName', 'company', 'domain',
            'industry', 'website', 'phone', 'location', 'validation',
            'emailVerified', 'domainVerified', 'verification_status',
            'score', 'recommendedProduct', 'source', 'created_at',
            'updated_at', 'last_verified'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_verified', 'verification_status']

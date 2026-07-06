from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Campaign, EmailSequence
from .serializers import CampaignSerializer, EmailSequenceSerializer


class CampaignViewSet(viewsets.ModelViewSet):
    """ViewSet for managing email campaigns."""
    
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    filterset_fields = ['status']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'total_sent']
    ordering = ['-created_at']
    
    @action(detail=True, methods=['post'])
    def add_prospects(self, request, pk=None):
        """Add prospects to a campaign."""
        campaign = self.get_object()
        prospect_ids = request.data.get('prospect_ids', [])
        
        campaign.prospects.add(*prospect_ids)
        
        serializer = self.get_serializer(campaign)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def launch(self, request, pk=None):
        """Launch a campaign (pre-send validation)."""
        campaign = self.get_object()
        
        # Validation checks
        errors = []
        
        if not campaign.prospects.exists():
            errors.append('Campaign has no prospects')
        
        # Check all prospects are verified
        unverified = campaign.prospects.filter(
            emailVerified=False
        ).count()
        if unverified > 0:
            errors.append(f'{unverified} prospects not verified - cannot send to unverified prospects')
        
        if not campaign.sequences.exists():
            errors.append('Campaign has no email sequences')
        
        if errors:
            return Response(
                {'errors': errors, 'status': 'validation_failed'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )
        
        # Update status
        campaign.status = 'running'
        campaign.save()
        
        serializer = self.get_serializer(campaign)
        return Response(serializer.data)


class EmailSequenceViewSet(viewsets.ModelViewSet):
    """ViewSet for managing email sequences."""
    
    queryset = EmailSequence.objects.all()
    serializer_class = EmailSequenceSerializer
    filterset_fields = ['campaign']
    ordering_fields = ['order']
    ordering = ['order']

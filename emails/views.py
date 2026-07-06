from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import EmailJob, EmailEvent, SuppressionList
from .serializers import EmailJobSerializer, EmailEventSerializer, SuppressionListSerializer
from .tasks import send_email_job


class EmailJobViewSet(viewsets.ModelViewSet):
    """ViewSet for managing email jobs."""
    
    queryset = EmailJob.objects.all()
    serializer_class = EmailJobSerializer
    filterset_fields = ['status', 'prospect']
    ordering_fields = ['created_at', 'sent_at']
    ordering = ['-created_at']
    
    def create(self, request, *args, **kwargs):
        """Create and send email job."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email_job = serializer.save()
        
        # Queue for async sending
        send_email_job.delay(email_job.id)
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SuppressionListViewSet(viewsets.ModelViewSet):
    """ViewSet for managing suppression list."""
    
    queryset = SuppressionList.objects.all()
    serializer_class = SuppressionListSerializer
    filterset_fields = ['reason']
    search_fields = ['email']
    ordering_fields = ['added_at']
    ordering = ['-added_at']
    
    @action(detail=False, methods=['post'])
    def add_email(self, request):
        """Add email to suppression list."""
        email = request.data.get('email')
        reason = request.data.get('reason', 'manual')
        
        suppression, created = SuppressionList.objects.get_or_create(
            email=email,
            defaults={'reason': reason}
        )
        
        serializer = self.get_serializer(suppression)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'])
    def check(self, request):
        """Check if email is on suppression list."""
        email = request.query_params.get('email')
        
        if not email:
            return Response({'error': 'email parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        is_suppressed = SuppressionList.objects.filter(email=email).exists()
        
        return Response({'email': email, 'suppressed': is_suppressed})

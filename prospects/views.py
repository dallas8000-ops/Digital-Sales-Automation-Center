from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Prospect
from .serializers import ProspectSerializer
from emails.services import ValidationService


class ProspectViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing prospects with built-in email/domain validation.
    
    Endpoints:
    - GET /api/prospects/ - List all prospects
    - POST /api/prospects/ - Create new prospect (with mandatory validation)
    - GET /api/prospects/{id}/ - Get prospect detail
    - PUT /api/prospects/{id}/ - Update prospect
    - DELETE /api/prospects/{id}/ - Delete prospect
    - POST /api/prospects/validate/ - Batch validate prospects
    """
    
    queryset = Prospect.objects.all()
    serializer_class = ProspectSerializer
    filterset_fields = ['emailVerified', 'domainVerified', 'company', 'industry']
    search_fields = ['email', 'firstName', 'lastName', 'company']
    ordering_fields = ['created_at', 'score']
    ordering = ['-created_at']
    
    def create(self, request, *args, **kwargs):
        """
        Create prospect with mandatory email and domain validation.
        Returns 422 if validation fails.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        email = serializer.validated_data.get('email')
        domain = serializer.validated_data.get('domain')
        
        # Validate email and domain with Hunter.io
        validation_service = ValidationService()
        
        validation_result = {
            'email': None,
            'domain': None
        }
        
        # Validate email if provided
        if email:
            email_result = validation_service.validate_email(email)
            validation_result['email'] = email_result
            if not email_result.get('valid', False):
                return Response(
                    {
                        'error': 'Data not confirmed',
                        'reason': 'Email validation failed',
                        'email': email,
                        'validation': validation_result,
                        'saved': False
                    },
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY
                )
        
        # Validate domain if provided
        if domain:
            domain_result = validation_service.validate_domain(domain)
            validation_result['domain'] = domain_result
            if not domain_result.get('valid', False):
                return Response(
                    {
                        'error': 'Data not confirmed',
                        'reason': 'Domain validation failed',
                        'domain': domain,
                        'validation': validation_result,
                        'saved': False
                    },
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY
                )
        
        # Save prospect with validation results
        prospect = serializer.save(
            validation=validation_result,
            emailVerified=validation_result['email'].get('valid', False) if validation_result['email'] else False,
            domainVerified=validation_result['domain'].get('valid', False) if validation_result['domain'] else False,
            last_verified=timezone.now()
        )
        
        return Response(
            self.get_serializer(prospect).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=False, methods=['post'])
    def validate(self, request):
        """
        Batch validate existing prospects by email/domain.
        """
        prospect_ids = request.data.get('ids', [])
        prospects = Prospect.objects.filter(id__in=prospect_ids)
        
        validation_service = ValidationService()
        
        for prospect in prospects:
            # Validate email
            if prospect.email:
                email_result = validation_service.validate_email(prospect.email)
                prospect.validation['email'] = email_result
                prospect.emailVerified = email_result.get('valid', False)
            
            # Validate domain
            if prospect.domain:
                domain_result = validation_service.validate_domain(prospect.domain)
                prospect.validation['domain'] = domain_result
                prospect.domainVerified = domain_result.get('valid', False)
            
            prospect.last_verified = timezone.now()
            prospect.save()
        
        serializer = self.get_serializer(prospects, many=True)
        return Response(serializer.data)

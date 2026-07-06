import os
import requests
from django.conf import settings


class ValidationService:
    """
    Validates email addresses and domains using Hunter.io API.
    """
    
    def __init__(self, api_key=None):
        self.api_key = api_key or settings.HUNTER_API_KEY
        self.base_url = 'https://api.hunter.io/v2'
        
        if not self.api_key:
            raise ValueError(
                "HUNTER_API_KEY not configured. Set HUNTER_API_KEY in environment variables."
            )
    
    def validate_email(self, email):
        """
        Validate email address using Hunter.io email-verifier endpoint.
        
        Returns:
        {
            'email': str,
            'valid': bool,
            'reason': str or None,  # Why it's invalid (if applicable)
            'score': int,  # Confidence score 0-100
            'sources': list  # Where this email was found
        }
        """
        try:
            response = requests.get(
                f"{self.base_url}/email-verifier",
                params={'email': email, 'domain': self._extract_domain(email)},
                headers={'Authorization': f'Bearer {self.api_key}'},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                result = data.get('data', {})
                
                return {
                    'email': email,
                    'valid': result.get('status') == 'valid',
                    'reason': result.get('status'),
                    'score': result.get('score', 0),
                    'sources': result.get('sources', [])
                }
            else:
                return {
                    'email': email,
                    'valid': False,
                    'reason': f'API error: {response.status_code}',
                    'score': 0,
                    'sources': []
                }
        except Exception as e:
            return {
                'email': email,
                'valid': False,
                'reason': str(e),
                'score': 0,
                'sources': []
            }
    
    def validate_domain(self, domain):
        """
        Validate domain using Hunter.io domain-search endpoint.
        
        Returns:
        {
            'domain': str,
            'valid': bool,
            'pattern': str or None,  # Email pattern for this domain
            'emails_count': int,  # Number of emails found
            'organization': str or None  # Company associated with domain
        }
        """
        try:
            response = requests.get(
                f"{self.base_url}/domain-search",
                params={'domain': domain},
                headers={'Authorization': f'Bearer {self.api_key}'},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                result = data.get('data', {})
                
                return {
                    'domain': domain,
                    'valid': result.get('emails_count', 0) > 0,
                    'pattern': result.get('pattern'),
                    'emails_count': result.get('emails_count', 0),
                    'organization': result.get('organization')
                }
            else:
                return {
                    'domain': domain,
                    'valid': False,
                    'pattern': None,
                    'emails_count': 0,
                    'organization': None
                }
        except Exception as e:
            return {
                'domain': domain,
                'valid': False,
                'reason': str(e),
                'pattern': None,
                'emails_count': 0,
                'organization': None
            }
    
    def validate_prospect(self, prospect, validate_email=True, validate_domain=True):
        """
        Validate a prospect's email and/or domain.
        
        Args:
            prospect: Prospect object or dict with 'email' and/or 'domain'
            validate_email: Whether to validate email
            validate_domain: Whether to validate domain
        
        Returns:
            Updated prospect dict with validation results
        """
        if hasattr(prospect, '__dict__'):
            prospect_data = prospect.__dict__
        else:
            prospect_data = prospect
        
        validation_results = {}
        
        if validate_email and prospect_data.get('email'):
            validation_results['email'] = self.validate_email(prospect_data['email'])
        
        if validate_domain and prospect_data.get('domain'):
            validation_results['domain'] = self.validate_domain(prospect_data['domain'])
        
        if hasattr(prospect, 'validation'):
            prospect.validation = validation_results
        else:
            prospect_data['validation'] = validation_results
        
        return prospect_data if not hasattr(prospect, 'validation') else prospect
    
    def batch_validate_prospects(self, prospects, batch_size=5):
        """
        Validate multiple prospects with configurable batch size (respects rate limiting).
        
        Args:
            prospects: List of Prospect objects or dicts
            batch_size: How many to validate in each batch (default 5 to respect Hunter.io limits)
        
        Returns:
            List of validated prospects
        """
        validated = []
        
        for i, prospect in enumerate(prospects):
            self.validate_prospect(prospect)
            validated.append(prospect)
            
            # Rate limiting: pause between batches
            if (i + 1) % batch_size == 0:
                import time
                time.sleep(1)
        
        return validated
    
    @staticmethod
    def _extract_domain(email):
        """Extract domain from email address."""
        if '@' in email:
            return email.split('@')[1]
        return None

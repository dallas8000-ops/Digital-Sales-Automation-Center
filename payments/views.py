from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.conf import settings
import stripe

from .models import Payment, Product
from .serializers import PaymentSerializer, ProductSerializer

stripe.api_key = settings.STRIPE_SECRET_KEY


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for retrieving products."""
    
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    filterset_fields = ['category']
    ordering_fields = ['price', 'name']
    ordering = ['price']


class PaymentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing payments."""
    
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    filterset_fields = ['status', 'product']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Users can only see their own payments."""
        if self.request.user.is_superuser:
            return Payment.objects.all()
        return Payment.objects.filter(user=self.request.user)
    
    @action(detail=False, methods=['post'])
    def create_payment_intent(self, request):
        """Create a Stripe payment intent."""
        product_id = request.data.get('product_id')
        amount = request.data.get('amount')
        
        if not product_id or not amount:
            return Response(
                {'error': 'product_id and amount required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {'error': 'Product not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            intent = stripe.PaymentIntent.create(
                amount=int(float(amount) * 100),  # Convert to cents
                currency='usd',
                metadata={'product': product.name, 'user': request.user.id}
            )
            
            # Create payment record
            payment = Payment.objects.create(
                user=request.user,
                stripe_payment_intent=intent.id,
                amount=amount,
                product=product.name,
                status='pending'
            )
            
            return Response({
                'client_secret': intent.client_secret,
                'payment_id': payment.id,
                'amount': amount,
                'product': product.name
            })
        
        except stripe.error.StripeError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def confirm_payment(self, request):
        """Confirm a payment after Stripe processing."""
        payment_intent_id = request.data.get('payment_intent_id')
        
        try:
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            
            payment = Payment.objects.get(stripe_payment_intent=payment_intent_id)
            
            if intent.status == 'succeeded':
                payment.status = 'completed'
            elif intent.status == 'processing':
                payment.status = 'processing'
            else:
                payment.status = 'failed'
            
            payment.save()
            
            serializer = self.get_serializer(payment)
            return Response(serializer.data)
        
        except Payment.DoesNotExist:
            return Response(
                {'error': 'Payment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except stripe.error.StripeError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

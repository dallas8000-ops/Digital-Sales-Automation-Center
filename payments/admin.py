from django.contrib import admin
from .models import Payment, Product


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['user', 'product', 'amount', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['user__email', 'product', 'stripe_payment_intent']
    readonly_fields = ['stripe_payment_intent', 'created_at', 'updated_at']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'category', 'created_at']
    list_filter = ['category', 'price']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']

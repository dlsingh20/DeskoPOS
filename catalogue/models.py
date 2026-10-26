"""
Products and how outlets sell them.

Categories and products belong to the client, so outlets can share them; each outlet's
menus pick the categories it sells. The POS app works per restaurant: it sees the
categories on that outlet's menus and their products.
"""
from django.db import models
from django.db.models.functions import Lower

from core.models import MONEY, RATE, TenantModel, TimestampedModel, app_table


class Menu(TenantModel, TimestampedModel):
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, related_name='menus')
    name = models.TextField()
    description = models.TextField(blank=True, default='')
    available_from = models.TimeField(null=True, blank=True)
    available_until = models.TimeField(null=True, blank=True)
    available_days = models.JSONField(default=list, blank=True)  # ISO weekdays; empty = every day
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = app_table('menus')
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.name


class Category(TenantModel, TimestampedModel):
    parent = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='children')
    name = models.TextField()
    description = models.TextField(blank=True, default='')
    image_url = models.TextField(blank=True, default='')
    icon = models.TextField(blank=True, default='')
    # Single rate from before the tax master; used until the category is given a tax list
    tax_rate = models.DecimalField(default=0, **RATE)
    uses_tax_list = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    taxes = models.ManyToManyField('taxes.Tax', through='CategoryTax', related_name='categories')
    menus = models.ManyToManyField(Menu, through='MenuCategory', related_name='categories')

    class Meta:
        db_table = app_table('categories')
        ordering = ['sort_order', 'name', 'id']

    def __str__(self):
        return self.name


class CategoryTax(TenantModel):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='tax_links')
    tax = models.ForeignKey('taxes.Tax', on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = app_table('category_taxes')
        constraints = [models.UniqueConstraint('category', 'tax', name='category_taxes_uniq')]


class MenuCategory(TenantModel):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='category_links')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='menu_links')
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = app_table('menu_categories')
        constraints = [models.UniqueConstraint('menu', 'category', name='menu_categories_uniq')]


class Product(TenantModel, TimestampedModel):
    TYPES = ['item', 'combo', 'open_price', 'weighted']

    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    sku = models.TextField(null=True, blank=True)
    name = models.TextField()
    short_name = models.TextField(blank=True, default='')  # KOT / narrow receipts
    description = models.TextField(blank=True, default='')
    product_type = models.CharField(max_length=12, default='item', choices=[(t, t) for t in TYPES])
    price = models.DecimalField(default=0, **MONEY)
    cost_price = models.DecimalField(null=True, blank=True, **MONEY)
    is_vegetarian = models.BooleanField(default=False)
    is_vegan = models.BooleanField(default=False)
    is_gluten_free = models.BooleanField(default=False)
    is_spicy = models.BooleanField(default=False)
    allergens = models.JSONField(default=list, blank=True)
    calories = models.IntegerField(null=True, blank=True)
    preparation_minutes = models.IntegerField(null=True, blank=True)
    kitchen_notes = models.TextField(blank=True, default='')
    image_url = models.TextField(blank=True, default='')
    image_alt_text = models.TextField(blank=True, default='')
    discountable = models.BooleanField(default=True)
    # Off the menu for now (sold out) vs archived (is_active false: gone, kept for old bills)
    is_available = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = app_table('products')
        ordering = ['sort_order', 'name', 'id']
        constraints = [
            models.UniqueConstraint('category', Lower('name'), condition=models.Q(is_active=True),
                                    name='products_name_uniq'),
            models.UniqueConstraint('tenant', Lower('sku'), condition=models.Q(sku__isnull=False),
                                    name='products_sku_uniq'),
            models.CheckConstraint(condition=models.Q(price__gte=0), name='products_price_valid'),
        ]

    def __str__(self):
        return self.name

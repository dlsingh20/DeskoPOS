"""
/menus/, /menu-categories/ and /menu-items/ (the app's names for menus, categories and products).

The app asks per restaurant (?restaurant_id=): it gets the categories on that outlet's
menus and their products. Categories and products themselves belong to the client.
"""
from decimal import Decimal

from django.db.models import Count, ProtectedError, Q
from rest_framework import generics, serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts import audit
from core.money import MoneyField, format_money
from core.pagination import StandardPagination
from core.permissions import read_or_require
from outlets.models import Outlet
from outlets.services import outlets_for
from outlets.views import outlet_from_param
from taxes.models import Tax

from .models import Category, CategoryTax, Menu, MenuCategory, Product


class CataloguePagination(StandardPagination):
    # The POS reads the first page only: a restaurant's whole menu has to fit on it
    page_size = 500
    max_page_size = 1000


def _flag(request, name):
    value = request.query_params.get(name)
    return None if value not in ('true', 'false') else value == 'true'


# ---- Menus --------------------------------------------------------------------

class MenuSerializer(serializers.ModelSerializer):
    restaurant = serializers.PrimaryKeyRelatedField(source='outlet', queryset=Outlet.objects.all())
    is_available = serializers.BooleanField(source='is_active', required=False)
    categories = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['id', 'restaurant', 'name', 'description', 'available_from', 'available_until', 'available_days',
                  'sort_order', 'is_available', 'categories', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_client_user', False):
            self.fields['restaurant'].queryset = outlets_for(request.user)

    def get_categories(self, menu):
        return [link.category_id for link in menu.category_links.all()]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the menu name.')
        return value


def _menus(request):
    return Menu.objects.filter(outlet__in=outlets_for(request.user)).prefetch_related('category_links')


class MenuList(generics.ListCreateAPIView):
    serializer_class = MenuSerializer
    permission_classes = [read_or_require('settings.manage')]
    pagination_class = CataloguePagination

    def get_queryset(self):
        qs = _menus(self.request)
        outlet = outlet_from_param(self.request, required=False)
        return qs.filter(outlet=outlet) if outlet else qs

    def perform_create(self, serializer):
        menu = serializer.save()
        audit.record(self.request, 'menu.create', 'menu', menu.id, after={'name': menu.name})


class MenuDetail(generics.RetrieveUpdateAPIView):
    serializer_class = MenuSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        return _menus(self.request)


@api_view(['GET'])
def menus_by_restaurant(request):
    outlet = outlet_from_param(request)
    return Response(MenuSerializer(_menus(request).filter(outlet=outlet), many=True, context={'request': request}).data)


def default_menu(outlet):
    """The outlet's first open menu, created when it has none."""
    menu = Menu.objects.filter(outlet=outlet, is_active=True).first()
    return menu or Menu.objects.create(outlet=outlet, name='Main Menu')


# ---- Categories ---------------------------------------------------------------

def effective_tax_rate(category):
    """Sum of the category's percentage taxes, or its single rate when it has no tax list."""
    if not category.uses_tax_list:
        return category.tax_rate
    return sum((link.tax.rate for link in category.tax_links.all()
                if link.tax.is_active and link.tax.type == 'percentage'), Decimal(0))


def tax_summary(tax, tenant):
    summary = {'id': tax.id, 'name': tax.name, 'type': tax.type}
    if tax.type == 'percentage':
        summary['rate'] = f'{tax.rate:.3f}'
    else:
        decimals = int(tenant.get('currency_decimals') or 0)
        summary.update(amount=f'{tax.amount:.{decimals}f}', fixed_basis=tax.fixed_basis)
    return summary


class CategorySerializer(serializers.ModelSerializer):
    menu = serializers.PrimaryKeyRelatedField(queryset=Menu.objects.all(), required=False, write_only=True)
    restaurant = serializers.IntegerField(required=False, write_only=True)
    is_available = serializers.BooleanField(source='is_active', required=False)
    tax_rate = serializers.DecimalField(max_digits=7, decimal_places=2, required=False,
                                        min_value=Decimal(0), max_value=Decimal(100))
    tax_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'menu', 'restaurant', 'parent', 'image_url', 'icon', 'sort_order',
                  'is_available', 'tax_rate', 'tax_ids', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'description': {'required': False, 'allow_blank': True}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_client_user', False):
            self.fields['menu'].queryset = Menu.objects.filter(outlet__in=outlets_for(request.user))

    def to_representation(self, category):
        data = super().to_representation(category)
        request = self.context['request']
        links = list(category.menu_links.all())
        outlet = self.context.get('outlet')
        here = [l for l in links if outlet is None or l.menu.outlet_id == outlet.id] or links
        data['menu'] = here[0].menu_id if here else None
        data['restaurant'] = here[0].menu.outlet_id if here else None
        data['menus'] = [l.menu_id for l in links]
        data['is_active'] = category.is_active
        data['tax_rate'] = f'{effective_tax_rate(category):.2f}'
        if category.uses_tax_list:
            taxes = [l.tax for l in category.tax_links.all()]
            data['tax_ids'] = [t.id for t in taxes]
            data['taxes'] = [tax_summary(t, request.tenant) for t in taxes]
        else:
            data['tax_ids'] = []
            data['taxes'] = []
        data['product_count'] = getattr(category, 'product_count', None)
        return data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the category name.')
        return value

    def validate(self, attrs):
        request = self.context['request']
        menu = attrs.pop('menu', None)
        restaurant = attrs.pop('restaurant', None)
        if self.instance is None:
            if menu is None:
                if restaurant is None and self.context.get('outlet') is None:
                    raise serializers.ValidationError({'menu': 'Choose the menu (or restaurant) for this category.'})
                outlet = self.context.get('outlet')
                if restaurant is not None:
                    outlet = outlets_for(request.user).filter(id=restaurant).first()
                    if outlet is None:
                        raise serializers.ValidationError({'restaurant': 'No such restaurant.'})
                menu = default_menu(outlet)
            attrs['_menu'] = menu
        elif menu is not None:
            attrs['_menu'] = menu
        outlet_ids = {attrs['_menu'].outlet_id} if '_menu' in attrs else \
            set(MenuCategory.objects.filter(category=self.instance).values_list('menu__outlet_id', flat=True))

        name = attrs.get('name')
        if name:
            clash = Category.objects.filter(name__iexact=name, menu_links__menu__outlet_id__in=outlet_ids)
            if self.instance:
                clash = clash.exclude(id=self.instance.id)
            if clash.exists():
                raise serializers.ValidationError({'name': 'Another category in this restaurant has this name.'})

        if 'tax_ids' in attrs:
            ids = list(dict.fromkeys(attrs['tax_ids']))
            taxes = list(Tax.objects.filter(id__in=ids))
            usable = [t for t in taxes if t.outlet_id is None or t.outlet_id in outlet_ids]
            if len(usable) != len(ids):
                raise serializers.ValidationError({'tax_ids': "Some of these taxes don't exist for this restaurant."})
            attrs['tax_ids'] = [t for i in ids for t in usable if t.id == i]
        return attrs

    def _apply(self, category, menu, taxes):
        if menu is not None and not MenuCategory.objects.filter(menu=menu, category=category).exists():
            MenuCategory.objects.create(menu=menu, category=category, sort_order=category.sort_order)
        if taxes is not None:
            CategoryTax.objects.filter(category=category).delete()
            CategoryTax.objects.bulk_create([CategoryTax(category=category, tax=t, tenant_id=category.tenant_id) for t in taxes])
            category.uses_tax_list = True
            category.tax_rate = sum((t.rate for t in taxes if t.type == 'percentage'), Decimal(0))
            category.save(update_fields=['uses_tax_list', 'tax_rate', 'updated_at'])

    def create(self, validated):
        menu = validated.pop('_menu')
        taxes = validated.pop('tax_ids', None)
        category = Category.objects.create(**validated)
        self._apply(category, menu, taxes)
        return category

    def update(self, category, validated):
        menu = validated.pop('_menu', None)
        taxes = validated.pop('tax_ids', None)
        if category.uses_tax_list:
            validated.pop('tax_rate', None)  # follows its taxes
        category = super().update(category, validated)
        self._apply(category, menu, taxes)
        return category


def _categories(request, outlet=None):
    allowed = outlets_for(request.user)
    qs = Category.objects.filter(menu_links__menu__outlet__in=allowed)
    if outlet:
        qs = qs.filter(menu_links__menu__outlet=outlet)
    return (qs.distinct()
            .annotate(product_count=Count('products', filter=Q(products__is_active=True), distinct=True))
            .prefetch_related('menu_links__menu', 'tax_links__tax')
            .order_by('sort_order', 'name', 'id'))


class CategoryList(generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    permission_classes = [read_or_require('settings.manage')]
    pagination_class = CataloguePagination

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'outlet': outlet_from_param(self.request, required=False)}

    def get_queryset(self):
        qs = _categories(self.request, self.get_serializer_context()['outlet'])
        if self.request.query_params.get('menu'):
            qs = qs.filter(menu_links__menu_id=self.request.query_params['menu'])
        available = _flag(self.request, 'is_available')
        return qs if available is None else qs.filter(is_active=available)

    def perform_create(self, serializer):
        category = serializer.save()
        audit.record(self.request, 'category.create', 'category', category.id, after={'name': category.name})
        serializer.instance = _categories(self.request).get(id=category.id)


class CategoryDetail(generics.RetrieveUpdateAPIView):
    """No delete: categories are made unavailable (their products may be on old bills)."""
    serializer_class = CategorySerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        return _categories(self.request)

    def perform_update(self, serializer):
        category = serializer.save()
        audit.record(self.request, 'category.update', 'category', category.id, after=dict(self.request.data))
        serializer.instance = _categories(self.request).get(id=category.id)


# ---- Menu items (products) ----------------------------------------------------

DIETARY = [('is_vegetarian', 'vegetarian'), ('is_vegan', 'vegan'), ('is_gluten_free', 'gluten_free'), ('is_spicy', 'spicy')]


class AllergensField(serializers.Field):
    """A list of names; a comma-separated string is accepted too."""

    def to_internal_value(self, data):
        items = data.split(',') if isinstance(data, str) else data
        if not isinstance(items, list):
            raise serializers.ValidationError('Send a list of allergens.')
        return sorted({str(a).strip().lower() for a in items if str(a).strip()})

    def to_representation(self, value):
        return value or []


class MenuItemSerializer(serializers.ModelSerializer):
    price = MoneyField()
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    preparation_time_minutes = serializers.IntegerField(source='preparation_minutes', required=False, allow_null=True,
                                                        min_value=0, max_value=600)
    allergens = AllergensField(required=False)

    class Meta:
        model = Product
        fields = ['id', 'name', 'short_name', 'description', 'category', 'price', 'sku', 'product_type',
                  'is_available', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_spicy', 'allergens', 'calories',
                  'preparation_time_minutes', 'kitchen_notes', 'image_url', 'image_alt_text', 'discountable',
                  'sort_order', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']
        extra_kwargs = {f: {'required': False, 'allow_blank': True}
                        for f in ('short_name', 'description', 'kitchen_notes', 'image_url', 'image_alt_text')}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_client_user', False):
            self.fields['category'].queryset = Category.objects.filter(
                menu_links__menu__outlet__in=outlets_for(request.user)).distinct()

    def to_representation(self, product):
        data = super().to_representation(product)
        request = self.context['request']
        category = product.category
        data['formatted_price'] = format_money(product.price, request.tenant)
        data['category_name'] = category.name
        data['category_tax_rate'] = f'{effective_tax_rate(category):.2f}'
        data['tax_ids'] = [l.tax_id for l in category.tax_links.all()] if category.uses_tax_list else []
        data['dietary_tags'] = [tag for field, tag in DIETARY if getattr(product, field)]
        data['has_image'] = bool(product.image_url)
        outlet = self.context.get('outlet')
        data['restaurant'] = outlet.id if outlet else None
        return data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the product name.')
        if len(value) > 200:
            raise serializers.ValidationError('Use at most 200 characters.')
        return value

    def validate_sku(self, value):
        value = (value or '').strip() or None
        if value:
            clash = Product.objects.filter(sku__iexact=value)
            if self.instance:
                clash = clash.exclude(id=self.instance.id)
            if clash.exists():
                raise serializers.ValidationError('Another product has this SKU.')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', None))
        category = attrs.get('category', getattr(self.instance, 'category', None))
        if name and category:
            clash = Product.objects.filter(category=category, name__iexact=name, is_active=True)
            if self.instance:
                clash = clash.exclude(id=self.instance.id)
            if clash.exists():
                raise serializers.ValidationError({'name': 'This category already has a product with this name.'})
        return attrs


def _products(request):
    allowed = outlets_for(request.user)
    return (Product.objects.filter(is_active=True, category__menu_links__menu__outlet__in=allowed).distinct()
            .select_related('category').prefetch_related('category__tax_links__tax'))


class MenuItemList(generics.ListCreateAPIView):
    serializer_class = MenuItemSerializer
    permission_classes = [read_or_require('settings.manage')]
    pagination_class = CataloguePagination

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'outlet': outlet_from_param(self.request, required=False)}

    def get_queryset(self):
        params = self.request.query_params
        qs = _products(self.request)
        outlet = self.get_serializer_context()['outlet']
        if outlet:
            qs = qs.filter(category__menu_links__menu__outlet=outlet)
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('search'):
            qs = qs.filter(Q(name__icontains=params['search']) | Q(description__icontains=params['search'])
                           | Q(sku__iexact=params['search']))
        for name in ('is_available', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_spicy'):
            value = _flag(self.request, name)
            if value is not None:
                qs = qs.filter(**{name: value})
        return qs

    def perform_create(self, serializer):
        product = serializer.save()
        audit.record(self.request, 'product.create', 'product', product.id,
                     after={'name': product.name, 'price': str(product.price)})


class MenuItemDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MenuItemSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        return _products(self.request)

    def perform_update(self, serializer):
        before = {'name': serializer.instance.name, 'price': str(serializer.instance.price),
                  'is_available': serializer.instance.is_available}
        product = serializer.save()
        audit.record(self.request, 'product.update', 'product', product.id, before=before,
                     after={'name': product.name, 'price': str(product.price), 'is_available': product.is_available})

    def perform_destroy(self, product):
        audit.record(self.request, 'product.delete', 'product', product.id, before={'name': product.name})
        try:
            product.delete()
        except ProtectedError:
            # Sold before: archived so old bills keep their lines
            product.is_active = False
            product.is_available = False
            product.save(update_fields=['is_active', 'is_available', 'updated_at'])

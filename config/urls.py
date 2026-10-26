from django.urls import include, path

from core.views import health

urlpatterns = [
    path('health/', health),
    path('api/auth/', include('accounts.urls')),
    path('api/pos/api/', include('accounts.pos_urls')),
    path('api/platform/', include('console.urls')),
]

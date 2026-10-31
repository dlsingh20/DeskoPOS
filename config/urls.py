from django.urls import include, path

from console import onboarding
from core.views import health

urlpatterns = [
    path('health/', health),
    path('api/auth/', include('accounts.urls')),
    path('api/pos/api/', include('config.pos_urls')),
    path('api/accounting/', include('config.accounting_urls')),
    path('api/platform/', include('console.urls')),
    # Information Request Form: the client's page and its API (the secret link is the key)
    path('irf/<str:token>/', onboarding.page),
    path('api/irf/<str:token>/', onboarding.PublicForm.as_view()),
    path('api/irf/<str:token>/submit/', onboarding.PublicSubmit.as_view()),
    path('api/irf/<str:token>/files/', onboarding.PublicFiles.as_view()),
    path('api/irf/<str:token>/files/<int:file_id>/', onboarding.PublicFile.as_view()),
    path('api/irf/<str:token>/pdf/', onboarding.PublicPdf.as_view()),
]

from django.urls import path

from . import onboarding, views

urlpatterns = [
    path('auth/login/', views.platform_login),
    path('auth/change-password/', views.ChangeOwnPassword.as_view()),
    path('tenants/', views.TenantListCreate.as_view()),
    path('tenants/<int:pk>/', views.TenantDetail.as_view()),
    path('tenants/<int:pk>/activate/', views.TenantStatusAction.as_view(target='active')),
    path('tenants/<int:pk>/suspend/', views.TenantStatusAction.as_view(target='suspended')),
    path('tenants/<int:pk>/close/', views.TenantStatusAction.as_view(target='closed')),
    path('tenants/<int:pk>/reset-admin-password/', views.ResetAdminPassword.as_view()),
    path('login-id-available/', views.LoginIdAvailable.as_view()),
    path('plans/', views.PlanList.as_view()),
    path('countries/', views.CountryList.as_view()),
    path('audit/', views.AuditList.as_view()),
    path('onboarding/', onboarding.FormListCreate.as_view()),
    path('onboarding/import/preview/', onboarding.ImportPreview.as_view()),
    path('onboarding/import/', onboarding.ImportRun.as_view()),
    path('onboarding/<int:pk>/', onboarding.FormDetail.as_view()),
    path('onboarding/<int:pk>/reopen/', onboarding.FormReopen.as_view()),
    path('onboarding/<int:pk>/new-link/', onboarding.FormNewLink.as_view()),
    path('onboarding/<int:pk>/edit-link/', onboarding.FormEditLink.as_view()),
    path('onboarding/<int:pk>/export.json', onboarding.FormExportJson.as_view()),
    path('onboarding/<int:pk>/export.pdf', onboarding.FormExportPdf.as_view()),
    path('onboarding/<int:pk>/files/<int:file_id>/', onboarding.FormFile.as_view()),
]

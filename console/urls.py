from django.urls import path

from . import views

urlpatterns = [
    path('auth/login/', views.platform_login),
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
]

from django.urls import path

from . import views

urlpatterns = [
    path('token/', views.token),
    path('token/refresh/', views.token_refresh),
    path('logout/', views.logout),
    path('me/', views.me),
    path('change-password/', views.change_password),
    path('users/', views.UserList.as_view()),
    path('users/login-id-available/', views.login_id_available),
    path('users/<int:pk>/', views.UserDetail.as_view()),
    path('users/<int:pk>/set_active/', views.UserSetActive.as_view()),
    path('users/<int:pk>/set-password/', views.UserSetPassword.as_view()),
    path('users/<int:pk>/set-pin/', views.UserSetPin.as_view()),
    path('roles/', views.RoleList.as_view()),
    path('permissions/', views.PermissionList.as_view()),
    path('audit-logs/', views.AuditLogList.as_view()),
]

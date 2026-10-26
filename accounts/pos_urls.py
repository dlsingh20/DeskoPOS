from django.urls import path

from . import views

# POS module endpoints under /api/pos/api/. Other modules add theirs here as they are built.
urlpatterns = [
    path('approvals/', views.approvals),
]

"""Cash counters and shifts under /api/accounting/ (the paths the POS app uses)."""
from django.urls import path

from payments import shifts

urlpatterns = [
    path('cash-counters/', shifts.CounterList.as_view()),
    path('cash-counters/<int:pk>/', shifts.CounterDetail.as_view()),
    path('shift-templates/', shifts.shift_templates),
    path('cash-register/', shifts.ShiftList.as_view()),
    path('cash-register/current/', shifts.current_shift),
    path('cash-register/open_defaults/', shifts.open_defaults),
    path('cash-register/open/', shifts.open_shift),
    path('cash-register/<int:pk>/', shifts.shift_detail),
    path('cash-register/<int:pk>/close/', shifts.close_shift),
    path('cash-register/<int:pk>/movements/', shifts.movements),
]

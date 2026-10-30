"""POS endpoints under /api/pos/api/ (same paths the app uses today)."""
from django.urls import path

from accounts import views as accounts
from catalogue import views as catalogue
from floor import views as floor
from orders import reports
from orders import views as orders
from outlets import views as outlets
from payments import outstanding
from payments import views as payments
from taxes import views as taxes

urlpatterns = [
    path('approvals/', accounts.approvals),
    path('settings/', outlets.client_settings),
    path('restaurants/', outlets.RestaurantList.as_view()),
    path('restaurants/<int:pk>/', outlets.RestaurantDetail.as_view()),
    path('restaurants/<int:pk>/print-settings/', outlets.print_settings),
    path('staff/', accounts.staff),
    path('reports/top_items', reports.top_items),
    path('reports/top_items/', reports.top_items),
    path('tables/', floor.TableList.as_view()),
    path('tables/by_restaurant/', floor.tables_by_restaurant),
    path('tables/free_stale_tables/', floor.free_stale_tables),
    path('tables/<int:pk>/', floor.TableDetail.as_view()),
    path('tables/<int:pk>/update_status/', floor.update_status),
    path('tables/<int:pk>/generate_qr_code/', floor.generate_qr_code),
    path('tables/<int:pk>/split/', floor.split_table),
    path('tables/<int:pk>/remove_split/', floor.remove_split),
    path('taxes/', taxes.TaxList.as_view()),
    path('taxes/<int:pk>/', taxes.TaxDetail.as_view()),
    path('menus/', catalogue.MenuList.as_view()),
    path('menus/by_restaurant/', catalogue.menus_by_restaurant),
    path('menus/<int:pk>/', catalogue.MenuDetail.as_view()),
    path('menu-categories/', catalogue.CategoryList.as_view()),
    path('menu-categories/<int:pk>/', catalogue.CategoryDetail.as_view()),
    path('menu-items/', catalogue.MenuItemList.as_view()),
    path('menu-items/<int:pk>/', catalogue.MenuItemDetail.as_view()),
    path('orders/', orders.OrderList.as_view()),
    path('orders/kitchen_stats/', orders.kitchen_stats),
    path('orders/merge/', orders.merge_tables),
    path('orders/<int:pk>/', orders.OrderDetail.as_view()),
    path('orders/<int:pk>/update_status/', orders.update_status),
    path('orders/<int:pk>/cancel/', orders.cancel),
    path('orders/<int:pk>/send_kot/', orders.send_kot),
    path('orders/<int:pk>/unmerge/', orders.unmerge_table),
    path('order-items/', orders.add_item),
    path('order-items/<int:pk>/', orders.item_detail),
    path('order-items/<int:pk>/void/', orders.void_item),
    path('orders/<int:pk>/apply_discount/', payments.apply_discount),
    path('orders/<int:pk>/discount/', payments.remove_discount),
    path('orders/<int:pk>/settle/', payments.settle),
    path('orders/<int:pk>/refund/', payments.refund),
    path('order-payments/', payments.PaymentList.as_view()),
    path('order-payments/create_flexible_payment/', payments.flexible_payment),
    path('order-payments/<int:pk>/', payments.payment_detail),
    path('outstanding-orders/', outstanding.AccountList.as_view()),
    path('outstanding-orders/dashboard_stats/', outstanding.dashboard_stats),
    path('outstanding-orders/<int:pk>/', outstanding.account_detail),
    path('outstanding-orders/<int:pk>/contact_attempt/', outstanding.contact_attempt),
    path('outstanding-orders/<int:pk>/add_note/', outstanding.add_note),
    path('outstanding-orders/<int:pk>/resolve/', outstanding.resolve),
]

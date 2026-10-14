<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\ApplicantController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BiController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\CustomerPortalController;
use App\Http\Controllers\CustomerPriceController;
use App\Http\Controllers\DeliveryController;
use App\Http\Controllers\DeliveryProofController;
use App\Http\Controllers\DocumentScanController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\FaceDataController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\IceLoadingController;
use App\Http\Controllers\InventoryAlertController;
use App\Http\Controllers\KioskController;
use App\Http\Controllers\LeaveRequestController;
use App\Http\Controllers\LiveFeedController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\PickupLogController;
use App\Http\Controllers\PlaceSearchController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\PublicApplicationController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\RetentionController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\StockOutRequestController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\SupportMessageController;
use App\Http\Controllers\TimesheetController;
use Illuminate\Support\Facades\Route;

// RATE LIMITS
// throttle:max,minutes,name. Each limit has its own name so the counters
// are separate (the same request is not counted twice by two limits).
//   login: 10 attempts per minute per IP (stops password guessing)
//   kiosk: 30 per minute per IP (public Attendance Station routes)
//   api:   120 per minute per logged-in user (all protected routes)
// A blocked request gets HTTP 429 "Too Many Attempts."

// Public
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1,login');

// Forgot password: email a 6-digit code, then set a new password with it.
// 3 code emails and 10 reset tries per minute per IP.
Route::post('/forgot-password', [PasswordResetController::class, 'sendCode'])->middleware('throttle:3,1,forgot-password');
Route::post('/verify-reset-code', [PasswordResetController::class, 'verifyCode'])->middleware('throttle:10,1,reset-password');
Route::post('/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:10,1,reset-password');

// Attendance Station kiosk. It has no user login. A device is unlocked with the
// HR security PIN (POST kiosk/unlock) and then sends the kiosk token it gets in
// the X-Kiosk-Token header. The unlock route is public, but each kiosk (its own
// device_id) is locked after too many wrong PINs until Admin types the override
// PIN on it (App\Models\KioskDevice). The data routes below need the kiosk token.
Route::post('kiosk/unlock', [KioskController::class, 'unlock'])->middleware('throttle:30,1,kiosk-unlock');
Route::get('kiosk/lock-state', [KioskController::class, 'lockState'])->middleware('throttle:60,1,kiosk-unlock');
Route::post('kiosk/override', [KioskController::class, 'override'])->middleware('throttle:10,1,kiosk-override');
Route::get('kiosk/status', [KioskController::class, 'status'])->middleware(['kiosk', 'throttle:60,1,kiosk']);

// Face Descriptors: kiosk token required
Route::get('face-descriptors', [FaceDataController::class, 'descriptors'])->middleware(['kiosk', 'throttle:30,1,kiosk']);

// Public job application form (/apply, from the QR code in HRIS > Interviews)
Route::post('apply', [PublicApplicationController::class, 'store'])->middleware('throttle:20,10,apply');

// Attendance recording: kiosk token required
Route::post('attendances', [AttendanceController::class, 'store'])->middleware(['kiosk', 'throttle:30,1,kiosk']);

// Protected
// Live feed (realtime pop-up notices, polled every few seconds by every open
// page; see App\Support\LiveFeed). Own limit so polling never eats the api one.
Route::get('live-feed', [LiveFeedController::class, 'index'])
    ->middleware(['auth:sanctum', 'password.changed', 'throttle:40,1,live']);

Route::middleware(['auth:sanctum', 'password.changed', 'throttle:120,1,api'])->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Change own password (all roles). Throttled: 5 attempts per minute.
    Route::put('/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:5,1');
    Route::post('/logout-others', [AuthController::class, 'logoutOthers'])->middleware('throttle:5,1');

    // The controller looks up the Employee row from employees.user_id.
    Route::get('my-leave-requests', [LeaveRequestController::class, 'myIndex']);
    Route::get('my-leave-credits', [LeaveRequestController::class, 'myCredits']);
    Route::get('my-leave-requests/{id}/attachment', [LeaveRequestController::class, 'myAttachment']);
    Route::post('my-leave-requests', [LeaveRequestController::class, 'myStore']);
    Route::delete('my-leave-requests/{id}', [LeaveRequestController::class, 'myDestroy']);

    // Login fixes by a role higher up (Admin: HR/employee/driver/customer; HR:
    // employee/driver): change a wrong login email. The controller checks the roles.
    Route::put('accounts/{user}/email', [AccountController::class, 'updateEmail'])
        ->middleware(['role:hr', 'throttle:20,1,account-email']);

    // ADMIN ROUTES
    Route::middleware('role:admin')->group(function () {

        // Rates and rules (AppSupportSettings) and the audit log
        Route::get('settings', [SettingsController::class, 'index']);
        Route::put('settings', [SettingsController::class, 'update']);
        Route::get('audit-logs', [SettingsController::class, 'auditLogs']);
        // Holiday and overtime pay rates (dated)
        Route::get('pay-multipliers', [SettingsController::class, 'multipliers']);
        Route::post('pay-multipliers', [SettingsController::class, 'setMultiplier']);

        // Payroll Records: pay, adjustments, mark paid, payslip, 13th month
        Route::get('payroll-records', [PayrollController::class, 'records']);
        Route::get('payrolls/{id}/payslip', [PayrollController::class, 'payslip']);
        Route::post('payrolls/{id}/adjustments', [PayrollController::class, 'addAdjustment']);
        Route::delete('payroll-adjustments/{id}', [PayrollController::class, 'removeAdjustment']);
        Route::post('payrolls/mark-paid', [PayrollController::class, 'markPaid']);
        Route::get('thirteenth-month', [PayrollController::class, 'thirteenthMonth']);

        // Records past the retention period: Admin keeps or deletes each (never automatic)
        Route::get('retention-review', [RetentionController::class, 'index']);
        Route::post('retention-review/keep', [RetentionController::class, 'keep']);
        Route::post('retention-review/delete', [RetentionController::class, 'delete']);
        Route::post('retention-review/anonymize', [RetentionController::class, 'anonymize']);

        // Kiosk: the Admin override PIN that unlocks a locked kiosk, and the attempt log
        Route::put('admin/kiosk-override-pin', [KioskController::class, 'setAdminPin'])->middleware('throttle:5,1,kiosk-pin-change');
        Route::get('admin/kiosk-attempts', [KioskController::class, 'attempts']);

        // Add Customer: business/place search (OpenStreetMap) to fill the address and pin
        Route::get('places/from-link', [PlaceSearchController::class, 'fromLink'])->middleware('throttle:30,1');
        Route::get('places/reverse', [PlaceSearchController::class, 'reverse'])->middleware('throttle:40,1,places-reverse');

        // Employees: READ ONLY overview for Admin (Name/Position/Role/Shift
        // only, per team decision). Reuses EmployeeController@index() so
        // both Admin's and HR's employee lists stay in sync automatically,
        // same filtered dataset, different route/gate. Full CRUD and Payroll
        // are HR-only, see role:hr group below.
        Route::get('employees-summary', [EmployeeController::class, 'index']);

        // Delivery Management (Admin assigns deliveries)
        Route::get('deliveries', [DeliveryController::class, 'index']);
        Route::post('deliveries', [DeliveryController::class, 'store']);
        Route::get('deliveries/{id}', [DeliveryController::class, 'show']);
        Route::put('deliveries/{id}/cancel', [DeliveryController::class, 'cancel']);

        Route::get('products-summary', [ProductController::class, 'index']);

        // Delivery Proofs (Admin views)
        Route::get('delivery-proofs', [DeliveryProofController::class, 'index']);
        Route::get('delivery-proofs/{id}', [DeliveryProofController::class, 'show']);

        // Receipts (Admin views + manages)
        Route::get('receipts/overdue', [ReceiptController::class, 'overdue']);
        Route::get('receipts/summary', [ReceiptController::class, 'summary']);
        Route::get('receipts', [ReceiptController::class, 'index']);
        Route::get('receipts/{id}', [ReceiptController::class, 'show']);
        Route::patch('receipts/{id}/paid', [ReceiptController::class, 'markAsPaid']);

        // CRM
        Route::get('customers', [CustomerController::class, 'index']);
        Route::get('customers/check-email', [CustomerController::class, 'checkEmail'])->middleware('throttle:30,1,check-email');
        Route::get('customers/invoice-code', [CustomerController::class, 'suggestInvoiceCode']);
        Route::post('customers', [CustomerController::class, 'store']);
        Route::get('customers/{id}', [CustomerController::class, 'show']);
        Route::put('customers/{id}', [CustomerController::class, 'update']);
        Route::delete('customers/{id}', [CustomerController::class, 'destroy']);
        Route::post('customers/{id}/create-account', [CustomerController::class, 'createAccount']);

        Route::get('orders', [OrderController::class, 'index']);
        Route::post('orders', [OrderController::class, 'store']);
        Route::get('orders/{id}', [OrderController::class, 'show']);
        Route::put('orders/{id}/status', [OrderController::class, 'updateStatus']);
        Route::put('orders/{id}/cancel', [OrderController::class, 'cancel']);

        Route::get('payments', [PaymentController::class, 'index']);
        Route::post('payments', [PaymentController::class, 'store']);

        // Support Inbox: customer Contact Support messages (dispatch room)
        Route::get('support-messages', [SupportMessageController::class, 'index']);
        Route::patch('support-messages/{supportMessage}/resolve', [SupportMessageController::class, 'resolve']);
        Route::patch('support-messages/{supportMessage}/reopen', [SupportMessageController::class, 'reopen']);

        // Customer Pricing (Admin sets per-customer unit prices for Bags/Small Sack/Big Sack)
        Route::get('customer-prices', [CustomerPriceController::class, 'index']);
        Route::get('customer-prices/{customer}', [CustomerPriceController::class, 'show']);
        Route::put('customer-prices/{customer}', [CustomerPriceController::class, 'update']);

        // Pickup Logs (Admin full access: Alexandra/J-Maxine plant pickups, no price/receipt)
        Route::apiResource('pickup-logs', PickupLogController::class)->only(['update', 'destroy']);

        // Stock-Out Requests: Admin approves or rejects, then releases the
        // approved request. Release deducts the stock and records a confirmed
        // Stock Out. The Checker has no part in this flow.
        Route::put('stock-out-requests/{stockOutRequest}/approve', [StockOutRequestController::class, 'approve']);
        Route::put('stock-out-requests/{stockOutRequest}/reject', [StockOutRequestController::class, 'reject']);
        Route::put('stock-out-requests/{stockOutRequest}/release', [StockOutRequestController::class, 'release']);

        // Projects board (monday.com style): maintenance and plant jobs and
        // the supplies their stock-out requests used.
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store']);
        Route::put('projects/{project}', [ProjectController::class, 'update']);
        Route::delete('projects/{project}', [ProjectController::class, 'destroy']);

        // BUSINESS INTELLIGENCE
        Route::get('bi/summary', [BiController::class, 'summary']);
        Route::get('bi/sales-overview', [BiController::class, 'salesOverview']);
        Route::get('bi/sales-chart', [BiController::class, 'salesChart']);
        Route::get('bi/delivery-stats', [BiController::class, 'deliveryStats']);
        Route::get('bi/inventory-summary', [BiController::class, 'inventorySummary']);
        Route::get('bi/attendance-today', [BiController::class, 'attendanceToday']);
        Route::get('bi/forecast', [BiController::class, 'forecast']);
        Route::get('bi/overdue-receipts', [BiController::class, 'overdueReceipts']);
        Route::get('bi/recent-activity', [BiController::class, 'recentActivity']);
        Route::get('bi/expenses', [BiController::class, 'getExpenses']);
        Route::post('bi/expenses', [BiController::class, 'storeExpense']);
        Route::get('bi/ai-summary', [BiController::class, 'aiSummary']);

        Route::get('/admin/dashboard', function () {
            return response()->json(['message' => 'Welcome Admin!']);
        });
    });

    // HR ROUTES
    Route::middleware('role:hr')->group(function () {

        // Attendance Station kiosk PIN: HR sets or changes it (only Admin can unlock a locked kiosk).
        // Both changes need the HR user's own account password.
        Route::get('hr/kiosk-pin', [KioskController::class, 'show']);
        Route::post('kiosk-devices/{id}/unlock', [KioskController::class, 'remoteUnlock']);
        Route::put('hr/kiosk-pin', [KioskController::class, 'update'])->middleware('throttle:5,1,kiosk-pin-change');

        // Employee Management: full CRUD (create, edit, deactivate)
        Route::apiResource('employees', EmployeeController::class);
        // A deactivated employee back for a rehire (same employee ID, history kept)
        Route::post('employees/{id}/reactivate', [EmployeeController::class, 'reactivate']);

        // Payroll: full CRUD, computation happens on the frontend
        // (Sweldong Pinoy-style: SSS/PhilHealth/Pag-IBIG/withholding tax),
        // this endpoint just stores whatever computed values are sent.
        Route::get('payroll-periods', [PayrollController::class, 'periods']);
        // The cutoff containing a date (read-only start and end)
        Route::get('pay-period', [SettingsController::class, 'payPeriod']);
        // Payroll: HR approves each employee's timesheet for a pay period, which
        // makes their payroll; Admin pays it (payroll-records, admin group). HR
        // sees no amounts.
        Route::get('payrolls', [PayrollController::class, 'index']);
        Route::get('timesheets', [TimesheetController::class, 'index']);

        // Holiday calendar (HR and Admin)
        Route::get('holidays', [HolidayController::class, 'index']);
        Route::post('holidays', [HolidayController::class, 'store']);
        Route::put('holidays/{id}', [HolidayController::class, 'update']);
        Route::delete('holidays/{id}', [HolidayController::class, 'destroy']);
        Route::post('timesheets/approve', [TimesheetController::class, 'approve']);

        Route::get('attendances', [AttendanceController::class, 'index']);
        Route::get('attendances/summary', [AttendanceController::class, 'summary']);
        Route::get('attendances/export', [AttendanceController::class, 'export']);
        Route::get('attendances/roster', [AttendanceController::class, 'roster']);
        Route::put('attendances/{id}', [AttendanceController::class, 'update']);
        Route::get('attendances/employee/{employee_id}', [AttendanceController::class, 'getByEmployee']);

        Route::get('leave-requests', [LeaveRequestController::class, 'index']);
        Route::get('leave-requests/{id}', [LeaveRequestController::class, 'show']);
        Route::get('leave-requests/{id}/attachment', [LeaveRequestController::class, 'attachment']);
        Route::put('leave-requests/{id}/status', [LeaveRequestController::class, 'updateStatus']);
        Route::delete('leave-requests/{id}', [LeaveRequestController::class, 'destroy']);

        // Name, mobile, email and address from an uploaded resume, CV or driver's license (Groq vision)
        Route::post('scan-document', [DocumentScanController::class, 'scan'])->middleware('throttle:20,1');

        Route::get('applicants/upcoming', [ApplicantController::class, 'upcoming']);
        Route::get('applicants', [ApplicantController::class, 'index']);
        Route::post('applicants', [ApplicantController::class, 'store']);
        Route::get('applicants/{id}', [ApplicantController::class, 'show']);
        Route::get('applicants/{id}/resume', [ApplicantController::class, 'resume']);
        Route::put('applicants/{id}', [ApplicantController::class, 'update']);
        Route::patch('applicants/{id}/status', [ApplicantController::class, 'updateStatus']);
        Route::delete('applicants/{id}', [ApplicantController::class, 'destroy']);

        // Face Enrollment (HR manages)
        Route::post('face-enroll', [FaceDataController::class, 'enroll']);
        Route::get('face-data', [FaceDataController::class, 'index']);
        Route::put('face-data/{id}', [FaceDataController::class, 'update']);
        Route::delete('face-data/{id}', [FaceDataController::class, 'destroy']);
    });

    // EMPLOYEE: CHECKER ROUTES
    Route::middleware('role:employee,checker')->group(function () {

        Route::apiResource('products', ProductController::class);

        Route::get('stock-movements', [StockMovementController::class, 'index']);
        Route::post('stock-movements', [StockMovementController::class, 'store']);
        Route::get('stock-movements/{id}', [StockMovementController::class, 'show']);
        Route::put('stock-movements/{id}/confirm', [StockMovementController::class, 'confirm']);
        Route::put('stock-movements/{id}/cancel', [StockMovementController::class, 'cancel']);

        Route::get('inventory-alerts', [InventoryAlertController::class, 'index']);
        Route::put('inventory-alerts/{id}/resolve', [InventoryAlertController::class, 'resolve']);

        Route::apiResource('suppliers', SupplierController::class);

        // Pickup Logs (Checker can log + view, cannot edit/delete: corrections go through Admin)
        Route::get('pickup-logs', [PickupLogController::class, 'index']);
        Route::post('pickup-logs', [PickupLogController::class, 'store']);
        Route::get('pickup-logs/{pickupLog}', [PickupLogController::class, 'show']);

        // Ice Loading Count (simple count log per delivery, NOT a stock deduction)
        Route::get('ice-loadings', [IceLoadingController::class, 'index']);
        Route::post('ice-loadings', [IceLoadingController::class, 'store']);
        Route::get('ice-loadings/{iceLoading}', [IceLoadingController::class, 'show']);

        // Stock-Out Release is NOT here anymore: only the Admin releases
        // Maintenance stock-out requests (see the Admin group above).
    });

    // EMPLOYEE: SALESMAN ROUTES
    Route::middleware('role:employee,salesman')->group(function () {

        Route::get('my-deliveries', [DeliveryProofController::class, 'myDeliveries']);
        Route::post('delivery-confirmation', [DeliveryProofController::class, 'confirm']);
        Route::get('customer-prices/{customer}/lookup', [CustomerPriceController::class, 'lookup']);
    });

    // EMPLOYEE: MAINTENANCE ROUTES
    Route::middleware('role:employee,maintenance')->group(function () {

        Route::post('stock-out-requests', [StockOutRequestController::class, 'store']);
        Route::get('stock-out-items', [StockOutRequestController::class, 'items']);
        Route::get('project-options', [ProjectController::class, 'options']);

        // Maintenance views its own requests (the controller filters by
        // requester). The Admin reaches these same two endpoints through the
        // Admin override in RoleMiddleware and sees every request.
        Route::get('stock-out-requests', [StockOutRequestController::class, 'index']);
        Route::get('stock-out-requests/{stockOutRequest}', [StockOutRequestController::class, 'show']);
    });

    // DRIVER ROUTES
    Route::middleware('role:driver')->group(function () {

        Route::get('driver/deliveries', [DeliveryController::class, 'driverDeliveries']);
        Route::patch('driver/deliveries/{id}/status', [DeliveryController::class, 'updateStatus']);
        Route::get('/driver/dashboard', function () {
            return response()->json(['message' => 'Welcome Driver!']);
        });
    });

    // CUSTOMER ROUTES
    Route::middleware('role:customer')->group(function () {

        // my-orders/my-payments read from Order/Payment, which are dead
        // code as of v29.9 (the real flow is Delivery -> DeliveryProof ->
        // Receipt). Left in place, unused by the portal below, no
        // functional risk in leaving them.
        Route::get('my-orders', [OrderController::class, 'myOrders']);
        Route::get('my-payments', [PaymentController::class, 'myPayments']);

        // Customer Portal: real endpoints, scoped to the logged-in
        // customer via customers.user_id (see CustomerPortalController).
        Route::get('my-profile', [CustomerPortalController::class, 'myProfile']);
        Route::get('my-delivery-history', [CustomerPortalController::class, 'myDeliveries']);
        Route::get('my-receipts', [CustomerPortalController::class, 'myReceipts']);
        Route::get('my-delivery-proofs', [CustomerPortalController::class, 'myDeliveryProofs']);
        Route::get('my-prices', [CustomerPortalController::class, 'myPrices']);

        // Contact Support: messages go to the Admin dispatch inbox only.
        Route::get('my-support-messages', [SupportMessageController::class, 'myIndex']);
        Route::post('my-support-messages', [SupportMessageController::class, 'myStore'])->middleware('throttle:10,1');

        Route::get('/customer/dashboard', function () {
            return response()->json(['message' => 'Welcome Customer!']);
        });
    });
});

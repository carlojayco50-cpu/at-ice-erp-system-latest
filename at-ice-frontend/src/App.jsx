import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { NightScope } from './components/NightMode'
import SplashScreen from './components/SplashScreen'
import SoftPickers from './components/SoftPickers'
import Toaster from './components/Toaster'
import ActionGuard from './components/ActionGuard'
import AttachmentViewer from './components/AttachmentViewer'

// -- General Pages
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ApplyPage from './pages/ApplyPage'
import AttendanceStation from './pages/AttendanceStation'
import KioskGate from './components/KioskGate'
import LeaveRequestPage from './pages/LeaveRequestPage'

// -- Admin Module (folder is "Admin" with a capital A: Linux servers are
// case-sensitive, so every import must match it exactly)
import Dashboard from './pages/Admin/Dashboard'
import CustomerPriceManagement from './pages/Admin/CustomerPriceManagement'
import StockOutApprovalPage from './pages/Admin/StockOutApprovalPage'
import StockLimitsPage from './pages/Admin/StockLimitsPage'
import ProjectsPage from './pages/Admin/ProjectsPage'
import MaintenanceProjectsPage from './pages/employees/MaintenanceProjectsPage'
import EmployeesOverviewPage from './pages/Admin/EmployeesOverviewPage'
import PerformancePage from './pages/Admin/PerformancePage'
import CustomersPage from './pages/Admin/CustomersPage'
import DeliveriesPage from './pages/Admin/DeliveriesPage'
import ReceiptsPage from './pages/Admin/ReceiptsPage'
import SupportInboxPage from './pages/Admin/SupportInboxPage'
import SettingsPage from './pages/Admin/SettingsPage'

// -- Customer Module
import ChangePasswordPage from './pages/ChangePasswordPage'
import CustomerDashboard from './pages/customer/CustomerDashboard'
import CustomerDeliveries from './pages/customer/CustomerDeliveries'
import CustomerDeliveryProofs from './pages/customer/CustomerDeliveryProofs'
import CustomerReceipts from './pages/customer/CustomerReceipts'
import CustomerPrices from './pages/customer/CustomerPrices'
import CustomerSupport from './pages/customer/CustomerSupport'

// -- Driver Module
import { DeliveriesPage as DriverDeliveriesPage } from './pages/drivers/DeliveriesPage'
import { GpsTrackingPage } from './pages/drivers/GpsTrackingPage'

// -- HR Module
import HRDashboard from './pages/hr/HRDashboard'
import EmployeesPage from './pages/hr/EmployeesPage'
import AttendancePage from './pages/hr/AttendancePage'
import LeaveRequestsPage from './pages/hr/LeaveRequestsPage'
import InterviewsPage from './pages/hr/InterviewsPage'
import TimesheetsPage from './pages/hr/TimesheetsPage'
import HolidaysPage from './pages/hr/HolidaysPage'
import PayrollRecordsPage from './pages/Admin/PayrollRecordsPage'
import KioskPinPage from './pages/hr/KioskPinPage'

// -- Employee Module
import CheckerDashboard from './pages/employees/CheckerDashboard'
import CheckerIceLoadingPage from './pages/employees/CheckerIceLoadingPage'
import CheckerInventoryManagementPage from './pages/employees/CheckerInventoryManagementPage'
import CheckerStockMovementsPage from './pages/employees/CheckerStockMovementsPage'
import CheckerSupplierManagementPage from './pages/employees/CheckerSupplierManagementPage'
import SalesmanDashboard from './pages/employees/SalesmanDashboard'
import SalesmanDeliveryConfirmation from './pages/employees/SalesmanDeliveryConfirmation'
import MaintenanceDashboard from './pages/employees/MaintenanceDashboard'
import MaintenanceStockOutRequestPage from './pages/employees/MaintenanceStockOutRequestPage'


function App() {
  return (
    <BrowserRouter>
      {/* Intro once per browser tab session, over the page while it loads */}
      <SplashScreen />
      <SoftPickers />
      <Toaster />
      <ActionGuard />
      <AttachmentViewer />
      <Routes>

        {/* -- General (public, no auth needed) -- */}
        {/* One login page for every role. After login the user goes to their own
            dashboard, chosen by the role and sub_role the API returns. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* Public job application form, opened from the QR code in HRIS > Interviews */}
        <Route path="/apply" element={<ApplyPage />} />
        {/* The same form from an employee's referral link (records who referred) */}
        <Route path="/job-applications/:referrer" element={<ApplyPage />} />

        {/* Old per-role login links still work: they all go to the one login page. */}
        {["/admin/login", "/hr/login", "/driver/login", "/customer/login", "/checker/login", "/salesman/login", "/maintenance/login"].map((path) => (
          <Route key={path} path={path} element={<Navigate to="/login" replace />} />
        ))}
        <Route path="/attendance-station" element={<KioskGate><AttendanceStation /></KioskGate>} />

        {/* -- Leave Request (every Employee role and Driver, own requests only) -- */}
        <Route
          path="/my-leave"
          element={
            <ProtectedRoute allowedRoles={["employee", "driver"]}>
              <NightScope><LeaveRequestPage /></NightScope>
            </ProtectedRoute>
          }
        />

        {/* First-login password change, every role */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
        <Route path="/customer/change-password" element={<Navigate to="/change-password" replace />} />

        {/* -- Customer Module -- */}
        <Route
          path="/customer/dashboard"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/deliveries"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerDeliveries />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/delivery-proofs"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerDeliveryProofs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/receipts"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerReceipts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/prices"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerPrices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/support"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerSupport />
            </ProtectedRoute>
          }
        />

        {/* -- Admin Module -- */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/customer-prices"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <CustomerPriceManagement />
            </ProtectedRoute>
          }
        />
        {/* Stock-Out Approvals: Admin approves or rejects Maintenance
            requests, then releases the approved ones (stock is deducted
            on release). */}
        <Route
          path="/admin/stock-out-approvals"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <StockOutApprovalPage />
            </ProtectedRoute>
          }
        />
        {/* Minimum and maximum stock: Admin only (opened from Stock-Out Approvals). */}
        <Route
          path="/admin/stock-limits"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <StockLimitsPage />
            </ProtectedRoute>
          }
        />
        {/* Projects board (monday.com style): maintenance and plant jobs
            and the supplies their stock-out requests used. */}
        <Route
          path="/admin/projects"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <ProjectsPage />
            </ProtectedRoute>
          }
        />
        {/* View-only Employees overview for Admin: Name/Position/Role/Shift
            only, backed by GET /api/employees-summary. Full CRUD + Payroll
            live under HR at /hr/employees below. */}
        {/* Performance appraisals: draft ratings from the records, Admin only */}
        <Route
          path="/admin/performance"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <PerformancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/employees"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <EmployeesOverviewPage />
            </ProtectedRoute>
          }
        />
        {/* Customers: full CRUD for Customer CRM records, plus a
            "Create Login" action per row that provisions a Customer
            Portal account (role: customer) for an existing record. */}
        <Route
          path="/admin/customers"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        {/* Deliveries: full CRUD for outbound Deliveries. Admin assigns
            driver + customer + line items. */}
        <Route
          path="/admin/deliveries"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <DeliveriesPage />
            </ProtectedRoute>
          }
        />
        {/* Delivery proofs are part of Deliveries now (Proof column and
            the View dialog); the old address opens the Delivered filter. */}
        <Route path="/admin/delivery-proofs" element={<Navigate to="/admin/deliveries?status=delivered" replace />} />
        {/* Receipts: auto-generated on Salesman delivery confirmation.
            Admin tracks payment status here and marks receipts paid. */}
        <Route
          path="/admin/receipts"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />
        {/* Support Inbox: customer Contact Support messages (dispatch room). */}
        <Route
          path="/admin/support-inbox"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <SupportInboxPage />
            </ProtectedRoute>
          }
        />
        {/* Settings: account only. Profile, change password,
            sign out other devices. */}
        {/* Payroll Records: pay, earnings, mark paid, payslips, 13th month */}
        <Route
          path="/admin/payroll"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <PayrollRecordsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings/:section?"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* -- HR Module -- */}
        <Route
          path="/hr/dashboard"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <HRDashboard />
            </ProtectedRoute>
          }
        />
        {/* Face enrollment moved to the Face action in HRIS > Employees */}
        <Route path="/hr/face-enrollment" element={<Navigate to="/hr/employees" replace />} />
        <Route
          path="/hr/employees"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <EmployeesPage />
            </ProtectedRoute>
          }
        />
        {/* Attendance: view only, records come from the Attendance
            Station kiosk. Date filter, search, live Pusher refresh. */}
        <Route
          path="/hr/attendance"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        {/* Leave Requests: employees file their own from /my-leave, HR can
            also encode one, then approves or rejects it here. */}
        <Route
          path="/hr/leave-requests"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <LeaveRequestsPage />
            </ProtectedRoute>
          }
        />
        {/* Interviews: applicants and interview schedule.
            Pending -> Interviewed -> Hired / Rejected. */}
        <Route
          path="/hr/interviews"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <InterviewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hr/kiosk-pin"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <KioskPinPage />
            </ProtectedRoute>
          }
        />
        {/* Timesheets: HR approves each pay period's attendance, which makes the
            payroll (no pay amounts shown). Admin pays it on /admin/payroll. */}
        <Route
          path="/hr/timesheets"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <TimesheetsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/hr/payroll" element={<Navigate to="/hr/timesheets" replace />} />
        {/* Holiday calendar: attendance, leave and payroll read holidays from it */}
        <Route
          path="/hr/holidays"
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <HolidaysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/holidays"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <HolidaysPage admin />
            </ProtectedRoute>
          }
        />

        {/* -- Driver Module (night mode through NightScope) -- */}
        <Route
          path="/driver/deliveries"
          element={
            <ProtectedRoute allowedRoles={["driver"]}>
              <NightScope><DriverDeliveriesPage /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/gps"
          element={
            <ProtectedRoute allowedRoles={["driver"]}>
              <NightScope><GpsTrackingPage /></NightScope>
            </ProtectedRoute>
          }
        />

        {/* -- Employee Module (Phase 13, night mode through NightScope) -- */}
        <Route
          path="/checker/dashboard"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["checker"]}>
              <NightScope><CheckerDashboard /></NightScope>
            </ProtectedRoute>
          }
        />
        {/* The Checker's Pickup Log was removed (owner, 2026-10-16). */}
        <Route path="/checker/pickup-log" element={<Navigate to="/checker/dashboard" replace />} />
        <Route
          path="/checker/ice-loading"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["checker"]}>
              <NightScope><CheckerIceLoadingPage /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/checker/inventory"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["checker"]}>
              <NightScope><CheckerInventoryManagementPage /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/checker/stock-movements"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["checker"]}>
              <NightScope><CheckerStockMovementsPage /></NightScope>
            </ProtectedRoute>
          }
        />
        {/* No stock-out release page for the Checker: the Admin releases
            Maintenance requests. (/checker/low-stock stays removed: Low
            Stock Alert is a tab in Inventory Management.) */}
        <Route
          path="/checker/suppliers"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["checker"]}>
              <NightScope><CheckerSupplierManagementPage /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/salesman/deliveries"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["salesman"]}>
              <NightScope><SalesmanDashboard /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/salesman/deliveries/:id/confirm"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["salesman"]}>
              <NightScope><SalesmanDeliveryConfirmation /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/dashboard"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["maintenance"]}>
              <NightScope><MaintenanceDashboard /></NightScope>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/stock-out-request"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["maintenance"]}>
              <NightScope><MaintenanceStockOutRequestPage /></NightScope>
            </ProtectedRoute>
          }
        />

        <Route
          path="/maintenance/projects"
          element={
            <ProtectedRoute allowedRoles={["employee"]} allowedSubRoles={["maintenance"]}>
              <NightScope><MaintenanceProjectsPage /></NightScope>
            </ProtectedRoute>
          }
        />

        {/* Any unknown URL goes to the login page instead of a blank screen */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  )
}

export default App
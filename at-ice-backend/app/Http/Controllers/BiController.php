<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\DeliveryAdjustment;
use App\Models\Employee;
use App\Models\EmployeeMemo;
use App\Models\Expense;
use App\Models\LiveEvent;
use App\Models\Product;
use App\Models\Receipt;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BiController extends Controller
{
    // The app runs in UTC; "today" for attendance must be Philippine time.
    private const LOCAL_TZ = 'Asia/Manila';

    // Receipts unpaid for longer than this many days count as overdue
    // (same rule as ReceiptController@overdue).
    private const OVERDUE_DAYS = Receipt::OVERDUE_DAYS;

    // SQL for the month number (1-12) of a date column. MONTH() is MySQL
    // only; local dev and tests run on SQLite, which has strftime() instead.
    private static function monthOf(string $column): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(strftime('%m', {$column}) AS INTEGER)"
            : "MONTH({$column})";
    }

    // SQL for a part of a date column as a number: month (1-12), day (1-31)
    // or hour (0-23). SQLite (local dev, tests) has strftime(), MySQL has
    // MONTH() / DAY() / HOUR().
    private static function partOf(string $part, string $column): string
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            $fmt = ['month' => '%m', 'day' => '%d', 'hour' => '%H'][$part];

            return "CAST(strftime('{$fmt}', {$column}) AS INTEGER)";
        }

        return ['month' => 'MONTH', 'day' => 'DAY', 'hour' => 'HOUR'][$part]."({$column})";
    }

    // Receipt totals between two times, keyed by month, day or hour number
    private function totalsBy(string $part, Carbon $from, Carbon $to)
    {
        return Receipt::selectRaw(self::partOf($part, 'created_at').' as k, SUM(total_amount) as total')
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('k')
            ->get()
            ->keyBy('k');
    }

    // GET /api/bi/sales-chart?period=year|month|day&value=...
    // Sales Overview chart: the present period (this year, this month or
    // today) next to a past period picked on the calendar:
    //   year  (value 2024)       -> 12 months of 2024 against this year
    //   month (value 2026-08)    -> each day of Aug 2026 against this month
    //   day   (value 2026-10-01) -> each hour of Oct 1 against today
    // Without a value (or with the present itself) the picked period is the
    // one just before the present. Future dates are refused, and the parts of
    // the present that have not come yet are null, never zero.
    public function salesChart(Request $request)
    {
        $now = Carbon::now();
        $request->validate([
            'period' => 'nullable|in:year,month,day',
            'value' => 'nullable|string|max:10',
        ]);
        $period = $request->period ?: 'year';

        $startOf = fn (Carbon $d) => match ($period) {
            'year' => $d->copy()->startOfYear(),
            'month' => $d->copy()->startOfMonth(),
            'day' => $d->copy()->startOfDay(),
        };
        $endOf = fn (Carbon $d) => match ($period) {
            'year' => $d->copy()->endOfYear(),
            'month' => $d->copy()->endOfMonth(),
            'day' => $d->copy()->endOfDay(),
        };
        $before = fn (Carbon $d) => match ($period) {
            'year' => $d->copy()->subYear(),
            'month' => $d->copy()->subMonthNoOverflow(),
            'day' => $d->copy()->subDay(),
        };

        $present = $startOf($now);
        try {
            $picked = $request->filled('value')
                ? $startOf(match ($period) {
                    'year' => Carbon::create((int) $request->value, 1, 1),
                    'month' => Carbon::createFromFormat('Y-m-d', $request->value.'-01'),
                    'day' => Carbon::createFromFormat('Y-m-d', $request->value),
                })
                : $before($present);
        } catch (\Throwable) {
            return response()->json(['message' => 'Pick a valid date.', 'errors' => ['value' => ['Pick a valid date.']]], 422);
        }
        if ($picked->gt($now) || $picked->year < 2000) {
            return response()->json(['message' => 'The date cannot be in the future.', 'errors' => ['value' => ['The date cannot be in the future.']]], 422);
        }
        if ($picked->eq($present)) {
            $picked = $before($present);
        }

        $part = ['year' => 'month', 'month' => 'day', 'day' => 'hour'][$period];
        $presentTotals = $this->totalsBy($part, $present, $endOf($present));
        $pickedTotals = $this->totalsBy($part, $picked, $endOf($picked));

        // one point per month / day / hour; months can differ in length
        [$first, $count] = match ($period) {
            'year' => [1, 12],
            'month' => [1, max($present->daysInMonth, $picked->daysInMonth)],
            'day' => [0, 24],
        };
        $at = fn (Carbon $start, int $i) => match ($period) {
            'year' => $start->copy()->month($i),
            'month' => $i <= $start->daysInMonth ? $start->copy()->day($i) : null,
            'day' => $start->copy()->hour($i),
        };

        $points = [];
        for ($i = $first; $i < $first + $count; $i++) {
            $p = $at($present, $i);
            $q = $at($picked, $i);
            $points[] = [
                'key' => $i,
                'label' => match ($period) {
                    'year' => Carbon::create(2000, $i, 1)->format('M'),
                    'month' => (string) $i,
                    'day' => Carbon::create(2000, 1, 1, $i)->format('ga'),
                },
                'present' => ! $p || $p->gt($now) ? null : (float) ($presentTotals[$i]->total ?? 0),
                'picked' => ! $q ? null : (float) ($pickedTotals[$i]->total ?? 0),
            ];
        }

        $label = fn (Carbon $d) => match ($period) {
            'year' => (string) $d->year,
            'month' => $d->format('M Y'),
            'day' => $d->format('M j, Y'),
        };
        $value = fn (Carbon $d) => match ($period) {
            'year' => (string) $d->year,
            'month' => $d->format('Y-m'),
            'day' => $d->toDateString(),
        };
        $firstReceipt = Receipt::min('created_at');

        return response()->json([
            'period' => $period,
            'present_label' => $label($present),
            'picked_label' => $label($picked),
            'picked_value' => $value($picked),
            'present_total' => (float) collect($points)->sum('present'),
            'picked_total' => (float) collect($points)->sum('picked'),
            'points' => $points,
            // limits for the calendar: nothing after today
            'max_value' => $value($now),
            'first_year' => $firstReceipt ? min(Carbon::parse($firstReceipt)->year, $now->year - 1) : $now->year - 1,
        ]);
    }

    // GET /api/bi/sales-overview
    // Returns: monthly sales totals for current year (all 12 months),
    // plus prev month and same month last year for comparison
    public function salesOverview()
    {
        $now = Carbon::now();
        $thisYear = $now->year;
        $lastYear = $thisYear - 1;
        $thisMonth = $now->month;
        $prevMonth = $now->copy()->subMonth()->month;
        $prevMonthYear = $now->copy()->subMonth()->year;

        // Monthly totals, current year (for bar/line chart)
        $thisYearMonthly = Receipt::selectRaw(self::monthOf('created_at').' as month, SUM(total_amount) as total')
            ->whereYear('created_at', $thisYear)
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->keyBy('month');

        // Monthly totals, last year (for comparison chart)
        $lastYearMonthly = Receipt::selectRaw(self::monthOf('created_at').' as month, SUM(total_amount) as total')
            ->whereYear('created_at', $lastYear)
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->keyBy('month');

        // Build 12-month arrays
        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $months[] = [
                'month' => $m,
                'month_name' => Carbon::create()->month($m)->format('M'),
                'this_year' => isset($thisYearMonthly[$m]) ? (float) $thisYearMonthly[$m]->total : 0,
                'last_year' => isset($lastYearMonthly[$m]) ? (float) $lastYearMonthly[$m]->total : 0,
            ];
        }

        // Current month total
        $thisMonthTotal = Receipt::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->sum('total_amount');

        // Previous month total
        $prevMonthTotal = Receipt::whereYear('created_at', $prevMonthYear)
            ->whereMonth('created_at', $prevMonth)
            ->sum('total_amount');

        // Same month last year
        $sameMonthLastYear = Receipt::whereYear('created_at', $lastYear)
            ->whereMonth('created_at', $thisMonth)
            ->sum('total_amount');

        // Month-over-month % change
        $momChange = $prevMonthTotal > 0
            ? round((($thisMonthTotal - $prevMonthTotal) / $prevMonthTotal) * 100, 1)
            : null;

        // YoY % change
        $yoyChange = $sameMonthLastYear > 0
            ? round((($thisMonthTotal - $sameMonthLastYear) / $sameMonthLastYear) * 100, 1)
            : null;

        // Total paid vs unpaid this month
        $paidThisMonth = Receipt::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->where('payment_status', 'paid')
            ->sum('total_amount');

        $unpaidThisMonth = Receipt::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->whereIn('payment_status', ['unpaid', 'overdue'])
            ->sum('total_amount');

        // Total orders this month (receipt count)
        $totalOrders = Receipt::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->count();

        $avgOrderValue = $totalOrders > 0 ? round($thisMonthTotal / $totalOrders, 2) : 0;

        return response()->json([
            'monthly_chart' => $months,
            'this_month_total' => (float) $thisMonthTotal,
            'prev_month_total' => (float) $prevMonthTotal,
            'same_month_last_year' => (float) $sameMonthLastYear,
            'mom_change_pct' => $momChange,
            'yoy_change_pct' => $yoyChange,
            'paid_this_month' => (float) $paidThisMonth,
            'unpaid_this_month' => (float) $unpaidThisMonth,
            'total_orders' => $totalOrders,
            'avg_order_value' => $avgOrderValue,
            'current_month' => $now->format('F Y'),
        ]);
    }

    // GET /api/bi/delivery-stats
    // Returns: delivery counts by status + this month vs last month comparison
    public function deliveryStats()
    {
        $now = Carbon::now();
        $thisYear = $now->year;
        $thisMonth = $now->month;

        // All-time counts by status
        $statusCounts = Delivery::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $delivered = isset($statusCounts['delivered']) ? (int) $statusCounts['delivered']->count : 0;
        $inTransit = isset($statusCounts['in_transit']) ? (int) $statusCounts['in_transit']->count : 0;
        $pending = isset($statusCounts['pending']) ? (int) $statusCounts['pending']->count : 0;
        $cancelled = isset($statusCounts['cancelled']) ? (int) $statusCounts['cancelled']->count : 0;
        $total = $delivered + $inTransit + $pending + $cancelled;

        // This month
        $thisMonthTotal = Delivery::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->count();

        // Last month
        $lastMonth = $now->copy()->subMonth();
        $lastMonthTotal = Delivery::whereYear('created_at', $lastMonth->year)
            ->whereMonth('created_at', $lastMonth->month)
            ->count();

        $momChange = $lastMonthTotal > 0
            ? round((($thisMonthTotal - $lastMonthTotal) / $lastMonthTotal) * 100, 1)
            : null;

        // Delivery rate (delivered / total this month)
        $thisMonthDelivered = Delivery::whereYear('created_at', $thisYear)
            ->whereMonth('created_at', $thisMonth)
            ->where('status', 'delivered')
            ->count();

        $deliveryRate = $thisMonthTotal > 0
            ? round(($thisMonthDelivered / $thisMonthTotal) * 100, 1)
            : 0;

        return response()->json([
            'total' => $total,
            'delivered' => $delivered,
            'in_transit' => $inTransit,
            'pending' => $pending,
            'cancelled' => $cancelled,
            'this_month_total' => $thisMonthTotal,
            'last_month_total' => $lastMonthTotal,
            'mom_change_pct' => $momChange,
            'delivery_rate_pct' => $deliveryRate,
        ]);
    }

    // GET /api/bi/recent-activity
    // Admin's Recent Notifications: every action that reaches Admin (the same
    // live events that pop up, from App\Support\LiveFeed: leave, attendance,
    // deliveries and proofs, stock-out, receipts, support, customers...), plus
    // supplies that are low or out of stock and overdue receipts. Each entry
    // has a module, so the dashboard can open the matching page. Newest
    // first, at most 30.
    public function recentActivity(Request $request)
    {
        $items = collect();
        $me = $request->user();

        LiveEvent::where(fn ($q) => $q->whereNull('actor_id')->orWhere('actor_id', '!=', $me->id))
            ->latest('id')->limit(30)->get()
            ->each(function ($e) use ($items) {
                $items->push([
                    'key' => "ev-{$e->id}",
                    'type' => $e->module,
                    'module' => $e->module,
                    'title' => self::MODULE_TITLES[$e->module] ?? 'Update',
                    'body' => $e->message,
                    'at' => $e->created_at,
                ]);
            });

        Product::where('is_active', true)->whereColumn('current_stock', '<=', 'minimum_stock')
            ->latest('updated_at')->limit(5)->get()
            ->each(function ($p) use ($items) {
                $items->push([
                    'key' => "inv-{$p->id}-{$p->current_stock}",
                    'type' => 'inventory',
                    'module' => 'inventory',
                    'title' => 'Inventory Alert',
                    'body' => (int) $p->current_stock === 0
                        ? "{$p->name} is out of stock."
                        : "{$p->name} is low ({$p->current_stock} left).",
                    'at' => $p->updated_at,
                ]);
            });

        Receipt::markOverdue();
        $cutoff = Carbon::now()->subDays(self::OVERDUE_DAYS);
        Receipt::with('customer')
            ->where(fn ($q) => $q->where('payment_status', 'overdue')
                ->orWhere(fn ($q2) => $q2->where('payment_status', 'unpaid')->where('created_at', '<=', $cutoff)))
            ->latest()->limit(5)->get()
            ->each(function ($r) use ($items) {
                $items->push([
                    'key' => "pay-{$r->id}",
                    'type' => 'payment',
                    'module' => 'receipts',
                    'title' => 'Overdue Payment',
                    'body' => "{$r->receipt_no} (".($r->customer?->name ?? 'customer').') is overdue.',
                    // when it became overdue
                    'at' => $r->created_at->copy()->addDays(self::OVERDUE_DAYS),
                ]);
            });

        return response()->json(
            $items->sortByDesc('at')->take(30)->values()
                ->map(fn ($i) => ['at' => $i['at']?->toIso8601String()] + $i)
        );
    }

    private const MODULE_TITLES = [
        'leave' => 'Leave Request',
        'attendance' => 'Attendance',
        'employees' => 'Employees',
        'face' => 'Face Enrollment',
        'applicants' => 'Applicants',
        'payroll' => 'Payroll',
        'stock-out' => 'Stock-Out Request',
        'deliveries' => 'Delivery Update',
        'receipts' => 'Receipt',
        'inventory' => 'Inventory',
        'suppliers' => 'Suppliers',
        'pickups' => 'Pickup Log',
        'customers' => 'Customers',
        'prices' => 'Customer Prices',
        'support' => 'Support Message',
        'expenses' => 'Expenses',
    ];

    // GET /api/bi/inventory-summary
    // Returns: in stock / low stock / out of stock counts from products table
    // (supplies and materials only)
    public function inventorySummary()
    {
        $products = Product::where('is_active', true)->get();

        $inStock = $products->filter(fn ($p) => $p->current_stock > $p->minimum_stock)->count();
        $lowStock = $products->filter(fn ($p) => $p->current_stock > 0 && $p->current_stock <= $p->minimum_stock)->count();
        $outOfStock = $products->filter(fn ($p) => $p->current_stock === 0)->count();
        $total = $products->count();

        // Critical items (out of stock or low stock), top 5
        $criticalItems = $products
            ->filter(fn ($p) => $p->current_stock <= $p->minimum_stock)
            ->sortBy('current_stock')
            ->take(5)
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'product_code' => $p->product_code,
                'current_stock' => $p->current_stock,
                'minimum_stock' => $p->minimum_stock,
                'unit' => $p->unit,
                'status' => $p->current_stock === 0 ? 'out_of_stock' : 'low_stock',
            ])
            ->values();

        // Open projects on Admin's board and the supplies they used (Admin > Projects)
        $projects = collect(json_decode(app(ProjectController::class)->index()->content(), true))
            ->where('status', '!=', 'done')
            ->take(6)
            ->map(fn ($p) => \Illuminate\Support\Arr::only($p, ['id', 'name', 'status', 'priority', 'owner', 'due_date', 'materials_cost', 'requests_total', 'requests_waiting', 'progress', 'overdue']))
            ->values();

        return response()->json([
            'total' => $total,
            'in_stock' => $inStock,
            'low_stock' => $lowStock,
            'out_of_stock' => $outOfStock,
            'critical_items' => $criticalItems,
            'projects' => $projects,
        ]);
    }

    // GET /api/bi/attendance-today
    // Returns: today's attendance summary. "Today" is Philippine time
    // (the app runs in UTC, which is 8 hours behind).
    public function attendanceToday()
    {
        $now = Carbon::now(self::LOCAL_TZ);
        $today = $now->toDateString();

        // Count by status for today
        $statusCounts = Attendance::whereDate('date', $today)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $present = isset($statusCounts['present']) ? (int) $statusCounts['present']->count : 0;
        $late = isset($statusCounts['late']) ? (int) $statusCounts['late']->count : 0;
        $absent = isset($statusCounts['absent']) ? (int) $statusCounts['absent']->count : 0;
        $halfDay = isset($statusCounts['half_day']) ? (int) $statusCounts['half_day']->count : 0;
        $onLeave = isset($statusCounts['on_leave']) ? (int) $statusCounts['on_leave']->count : 0;

        // Total active employees
        $totalEmployees = Employee::where('is_active', true)->count();

        // Present + late count as "in"
        $totalIn = $present + $late + $halfDay;

        $attendanceRate = $totalEmployees > 0
            ? round(($totalIn / $totalEmployees) * 100, 1)
            : 0;

        // Weekly trend (last 7 days) for mini chart
        $weeklyTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $day = $now->copy()->subDays($i);
            $count = Attendance::whereDate('date', $day->toDateString())
                ->whereIn('status', ['present', 'late', 'half_day'])
                ->count();
            $weeklyTrend[] = [
                'date' => $day->format('D'),
                'count' => $count,
            ];
        }

        return response()->json([
            'date' => $today,
            'total_employees' => $totalEmployees,
            'present' => $present,
            'late' => $late,
            'absent' => $absent,
            'half_day' => $halfDay,
            'on_leave' => $onLeave,
            'total_in' => $totalIn,
            'attendance_rate' => $attendanceRate,
            'weekly_trend' => $weeklyTrend,
        ]);
    }

    // GET /api/bi/expenses
    // Returns: all expenses, grouped by month
    public function getExpenses(Request $request)
    {
        $year = $request->query('year', Carbon::now()->year);

        $expenses = Expense::whereYear('expense_date', $year)
            ->orderBy('expense_date', 'desc')
            ->get()
            ->groupBy(fn ($e) => Carbon::parse($e->expense_date)->format('Y-m'));

        // Build monthly summary for chart
        $monthly = [];
        for ($m = 1; $m <= 12; $m++) {
            $key = Carbon::create($year, $m)->format('Y-m');
            $monthData = $expenses->get($key, collect());
            $monthly[] = [
                'month' => $m,
                'month_name' => Carbon::create()->month($m)->format('M'),
                'fuel' => (float) $monthData->where('category', 'fuel')->sum('amount'),
                'water' => (float) $monthData->where('category', 'water')->sum('amount'),
                'electricity' => (float) $monthData->where('category', 'electricity')->sum('amount'),
                'others' => (float) $monthData->where('category', 'others')->sum('amount'),
                'total' => (float) $monthData->sum('amount'),
            ];
        }

        // Year totals
        $allThisYear = Expense::whereYear('expense_date', $year)->get();

        return response()->json([
            'year' => (int) $year,
            'monthly_chart' => $monthly,
            'year_total' => (float) $allThisYear->sum('amount'),
            'fuel_total' => (float) $allThisYear->where('category', 'fuel')->sum('amount'),
            'water_total' => (float) $allThisYear->where('category', 'water')->sum('amount'),
            'electricity_total' => (float) $allThisYear->where('category', 'electricity')->sum('amount'),
            'others_total' => (float) $allThisYear->where('category', 'others')->sum('amount'),
        ]);
    }

    // POST /api/bi/expenses
    // Admin manually inputs expense (fuel, water, electricity, others)
    // Body: { category, amount, expense_date, notes }
    public function storeExpense(Request $request)
    {
        $validated = $request->validate([
            'category' => 'required|in:fuel,water,electricity,others',
            'amount' => 'required|numeric|min:0',
            'expense_date' => 'required|date',
            'notes' => 'nullable|string|max:500',
        ]);

        $expense = Expense::create($validated);

        return response()->json([
            'message' => 'Expense recorded successfully.',
            'expense' => $expense,
        ], 201);
    }

    // GET /api/bi/overdue-receipts
    // Returns: receipts that are overdue. Counts BOTH receipts already marked
    // "overdue" (the Receipts page marks them) AND unpaid receipts older than
    // 15 days that have not been marked yet. Previously only "unpaid" was
    // counted, so the card showed 0 once the Receipts page had marked them.
    public function overdueReceipts()
    {
        Receipt::markOverdue();
        $cutoff = Carbon::now()->subDays(self::OVERDUE_DAYS);

        $overdue = Receipt::with(['delivery.customer'])
            ->where(function ($q) use ($cutoff) {
                $q->where('payment_status', 'overdue')
                    ->orWhere(function ($q2) use ($cutoff) {
                        $q2->where('payment_status', 'unpaid')
                            ->where('created_at', '<=', $cutoff);
                    });
            })
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'receipt_no' => $r->receipt_no,
                'total_amount' => (float) $r->total_amount,
                'created_at' => $r->created_at->toDateString(),
                'days_overdue' => (int) $r->created_at->diffInDays(Carbon::now()),
                'customer_name' => $r->delivery?->customer?->name ?? 'N/A',
                'customer_id' => $r->customer_id,
            ]);

        return response()->json([
            'total_overdue_amount' => (float) $overdue->sum('total_amount'),
            'overdue_count' => $overdue->count(),
            'overdue_customers' => $overdue->pluck('customer_id')->filter()->unique()->count(),
            'receipts' => $overdue->values(),
        ]);
    }

    // GET /api/bi/summary
    // Single endpoint - returns ALL BI data in one call
    public function summary()
    {
        $expenseRequest = new \Illuminate\Http\Request;

        return response()->json([
            'sales' => json_decode($this->salesOverview()->content(), true),
            'deliveries' => json_decode($this->deliveryStats()->content(), true),
            'inventory' => json_decode($this->inventorySummary()->content(), true),
            'attendance' => json_decode($this->attendanceToday()->content(), true),
            'expenses' => json_decode($this->getExpenses($expenseRequest)->content(), true),
            'overdue' => json_decode($this->overdueReceipts()->content(), true),
            'forecast' => $this->forecastData(),
            'drivers_today' => $this->driversToday(),
            'stores' => $this->storePerformance(),
            'discipline' => $this->disciplineStats(),
            'same_day' => $this->sameDayStats(),
        ]);
    }

    // HR memos (App\Support\MemoEngine, EmployeeMemoController): drafts waiting
    // for HR, memos waiting on employees, open investigations, and this month's
    // memos and zero-tolerance offenses.
    private function disciplineStats(): array
    {
        $month = now()->startOfMonth();

        return [
            'drafts' => EmployeeMemo::where('status', 'draft')->count(),
            'awaiting_employee' => EmployeeMemo::whereIn('status', ['sent', 'awaiting_physical'])->count(),
            'pending_investigations' => Employee::whereNotNull('investigation_status')->whereNull('deactivated_at')->count(),
            'memos_this_month' => EmployeeMemo::where('status', '!=', 'cancelled')->where('incident_date', '>=', $month->toDateString())->count(),
            'zero_tolerance_this_month' => EmployeeMemo::where('status', '!=', 'cancelled')->where('category', 'zero_tolerance')->where('incident_date', '>=', $month->toDateString())->count(),
            'missed_time_outs_this_month' => EmployeeMemo::where('status', '!=', 'cancelled')->where('violation', 'no_time_out')->where('incident_date', '>=', $month->toDateString())->count(),
        ];
    }

    // Same-day delivery changes (App\Support\DeliveryAdjust): urgent top-ups and
    // sacks added or reduced, today and over the last 30 days.
    private function sameDayStats(): array
    {
        $today = now()->toDateString();
        $since = now()->subDays(30);
        $net = function ($rows) {
            $total = 0;
            foreach ($rows as $changes) {
                foreach ($changes as $c) {
                    $total += ($c['after'] ?? 0) - ($c['before'] ?? 0);
                }
            }

            return $total;
        };

        return [
            'top_ups_today' => Delivery::where('is_top_up', true)->whereDate('scheduled_date', $today)->where('status', '!=', 'cancelled')->count(),
            'top_ups_30_days' => Delivery::where('is_top_up', true)->where('scheduled_date', '>=', $since->toDateString())->where('status', '!=', 'cancelled')->count(),
            'sacks_added_30_days' => $net(DeliveryAdjustment::whereIn('kind', ['add', 'top_up'])->where('created_at', '>=', $since)->pluck('changes')),
            'sacks_reduced_30_days' => -$net(DeliveryAdjustment::where('kind', 'reduce')->where('created_at', '>=', $since)->pluck('changes')),
        ];
    }

    // GET /api/bi/forecast
    public function forecast()
    {
        return response()->json($this->forecastData());
    }

    // MRR and next month's estimate, from invoices (receipts) of the last six
    // complete months:
    //   mrr: monthly recurring revenue, the average of the last 3 complete
    //        months from customers who bought in at least 2 of those 3 months
    //        (regular stores, not one-time buyers)
    //   next_month: revenue and quantity per ice product, from the trend of
    //        the last 6 months (least squares line), never below zero; with
    //        less than 3 months of sales it is the plain average instead
    //   history: the 6 months, for the chart
    public function forecastData(): array
    {
        $now = Carbon::now(self::LOCAL_TZ);
        $first = $now->copy()->startOfMonth()->subMonths(6);
        $months = collect(range(0, 5))->map(fn ($i) => $first->copy()->addMonths($i)->format('Y-m'));

        $receipts = Receipt::with('items:id,receipt_id,product_type,quantity')
            ->where('created_at', '>=', $first->copy()->timezone(config('app.timezone')))
            ->where('created_at', '<', $now->copy()->startOfMonth()->timezone(config('app.timezone')))
            ->get(['id', 'customer_id', 'total_amount', 'quantity', 'created_at']);
        $monthOf = fn ($r) => Carbon::parse($r->created_at)->timezone(self::LOCAL_TZ)->format('Y-m');

        $products = array_keys(\App\Models\DeliveryItem::PRODUCT_TYPES);
        $history = $months->map(function ($m) use ($receipts, $monthOf, $products) {
            $inMonth = $receipts->filter(fn ($r) => $monthOf($r) === $m);
            $qty = array_fill_keys($products, 0);
            foreach ($inMonth as $r) {
                foreach ($r->items as $it) {
                    if (isset($qty[$it->product_type])) {
                        $qty[$it->product_type] += (int) $it->quantity;
                    }
                }
            }

            return [
                'month' => $m,
                'label' => Carbon::createFromFormat('Y-m-d', $m.'-01')->format('M Y'),
                'revenue' => round((float) $inMonth->sum('total_amount'), 2),
                'quantity' => $qty,
                'invoices' => $inMonth->count(),
            ];
        })->values();

        // Regular customers: bought in at least 2 of the last 3 complete months.
        $last3 = $months->slice(-3)->values();
        $regular = $receipts->filter(fn ($r) => $last3->contains($monthOf($r)))
            ->groupBy('customer_id')
            ->filter(fn ($rs) => $rs->map($monthOf)->unique()->count() >= 2);
        $mrr = round($regular->flatten()->sum('total_amount') / 3, 2);

        $active = $history->filter(fn ($h) => $h['revenue'] > 0)->count();
        $estimate = function (array $ys) use ($active) {
            $ys = array_values($ys);
            $n = count($ys);
            if ($active < 3) {
                $nonZero = array_filter($ys);

                return $nonZero ? array_sum($nonZero) / count($nonZero) : 0;
            }
            $mx = ($n - 1) / 2;
            $my = array_sum($ys) / $n;
            $num = $den = 0;
            foreach ($ys as $x => $y) {
                $num += ($x - $mx) * ($y - $my);
                $den += ($x - $mx) ** 2;
            }
            $slope = $den ? $num / $den : 0;

            return max(0, $my + $slope * ($n - $mx));
        };

        $nextQty = [];
        foreach ($products as $p) {
            $nextQty[$p] = (int) round($estimate($history->pluck("quantity.$p")->all()));
        }
        $nextRevenue = round($estimate($history->pluck('revenue')->all()), 2);
        $lastRevenue = (float) ($history->last()['revenue'] ?? 0);
        $method = $active < 3 ? 'average' : 'trend';

        // No complete month of sales yet (a new system): this month's pace so
        // far, stretched to a whole month, is the estimate and the MRR.
        if ($active === 0) {
            $monthStart = $now->copy()->startOfMonth();
            $sofar = Receipt::with('items:id,receipt_id,product_type,quantity')
                ->where('created_at', '>=', $monthStart->copy()->timezone(config('app.timezone')))
                ->get(['id', 'total_amount']);
            $scale = $now->daysInMonth / max(1, $now->day);
            $nextRevenue = round((float) $sofar->sum('total_amount') * $scale, 2);
            foreach ($products as $p) {
                $nextQty[$p] = (int) round($sofar->flatMap->items->where('product_type', $p)->sum('quantity') * $scale);
            }
            $mrr = $nextRevenue;
            $method = 'this_month';
        }

        return [
            'mrr' => $mrr,
            'regular_customers' => $regular->count(),
            'next_month' => [
                'label' => $now->copy()->addMonthNoOverflow()->format('F Y'),
                'revenue' => $nextRevenue,
                'quantity' => $nextQty,
                'change_pct' => $lastRevenue > 0 ? round(($nextRevenue - $lastRevenue) / $lastRevenue * 100, 1) : null,
                'method' => $method,
            ],
            'product_labels' => \App\Models\DeliveryItem::PRODUCT_TYPES,
            'history' => $history,
        ];
    }

    // Drivers today: each active Driver's time in and out (Attendance Station)
    // and their deliveries today: delivered, in transit and still pending.
    public function driversToday(): array
    {
        $today = Carbon::now(self::LOCAL_TZ)->toDateString();
        $dayStart = Carbon::parse($today, self::LOCAL_TZ)->startOfDay()->timezone(config('app.timezone'));
        $dayEnd = $dayStart->copy()->addDay();

        $drivers = Employee::with(['user:id,name,role', 'attendances' => fn ($q) => $q->whereDate('date', $today)])
            ->where('is_active', true)
            ->whereHas('user', fn ($q) => $q->where('role', 'driver'))
            ->get();

        $userIds = $drivers->pluck('user_id')->filter()->all();
        $deliveries = Delivery::whereIn('driver_id', $userIds)
            ->where(fn ($q) => $q->whereBetween('delivered_at', [$dayStart, $dayEnd])
                ->orWhereDate('scheduled_date', $today)
                ->orWhere('status', 'in_transit'))
            ->get(['id', 'driver_id', 'status', 'delivered_at', 'scheduled_date']);

        return $drivers->map(function ($d) use ($deliveries, $dayStart, $dayEnd) {
            $mine = $deliveries->where('driver_id', $d->user_id);
            $att = $d->attendances->first();

            return [
                'employee_id' => $d->id,
                'name' => $d->full_name,
                'vehicle_plate' => $d->vehicle_plate,
                'time_in' => $att?->time_in,
                'time_out' => $att?->time_out,
                'status' => $att?->status ?? 'absent',
                'delivered' => $mine->filter(fn ($x) => $x->status === 'delivered' && $x->delivered_at && $x->delivered_at->between($dayStart, $dayEnd))->count(),
                'in_transit' => $mine->where('status', 'in_transit')->count(),
                'pending' => $mine->where('status', 'pending')->count(),
            ];
        })->sortByDesc('delivered')->values()->all();
    }

    // Store performance this month: each store's deliveries received, ice
    // quantity, invoice total and unpaid balance, best first (top 10).
    public function storePerformance(): array
    {
        $now = Carbon::now(self::LOCAL_TZ);
        $from = $now->copy()->startOfMonth()->timezone(config('app.timezone'));

        return Receipt::with('customer:id,name,invoice_code,city')
            ->where('created_at', '>=', $from)
            ->get(['id', 'customer_id', 'quantity', 'total_amount', 'payment_status'])
            ->groupBy('customer_id')
            ->map(fn ($rs) => [
                'customer_id' => $rs->first()->customer_id,
                'name' => $rs->first()->customer?->name ?? 'Unknown',
                'invoice_code' => $rs->first()->customer?->invoice_code,
                'city' => $rs->first()->customer?->city,
                'deliveries' => $rs->count(),
                'quantity' => (int) $rs->sum('quantity'),
                'revenue' => round((float) $rs->sum('total_amount'), 2),
                'unpaid' => round((float) $rs->whereIn('payment_status', ['unpaid', 'overdue'])->sum('total_amount'), 2),
            ])
            ->sortByDesc('revenue')->take(10)->values()->all();
    }

    // If a reply was cut off by the token limit, keep only complete
    // sentences so the dashboard never shows a half sentence.
    private function trimToCompleteSentence(string $text): string
    {
        $text = trim($text);

        if ($text === '' || preg_match('/[.!?]["\')\]]?$/u', $text)) {
            return $text;
        }

        $lastEnd = max(
            (int) mb_strrpos($text, '. '),
            (int) mb_strrpos($text, '! '),
            (int) mb_strrpos($text, '? ')
        );

        return $lastEnd > 0 ? mb_substr($text, 0, $lastEnd + 1) : $text;
    }

    // The last AI summary is kept in the cache (the database store outside
    // tests, so it survives restarts) together with a fingerprint of exactly
    // what was sent to Groq. Groq's free tier allows only about 7,000 input
    // tokens a minute, so Groq is asked again only when that fingerprint
    // changes, that is when the figures, the prompt or the model settings
    // change.
    private const AI_CACHE_KEY = 'bi.ai_summary';

    // Set after a 429 from Groq: no new request before this time.
    private const AI_WAIT_KEY = 'bi.ai_summary.wait_until';

    // Only one request at a time may call Groq (many dashboards loading at once).
    private const AI_LOCK_KEY = 'bi.ai_summary.lock';

    // The Admin's Refresh button asks for a new summary even when the figures
    // are the same, but at most once in this many seconds.
    private const AI_FORCE_COOLDOWN = 300;

    // GET /api/bi/ai-summary (?refresh=1 from the Admin's Refresh button)
    // Returns { summary, generated_at, stale, message }. stale = Groq could
    // not be asked, so this is the last summary, made from older figures.
    public function aiSummary(Request $request)
    {
        $data = json_decode($this->summary()->content(), true);

        $prompt = 'You are a business analyst AI for Bella Erin Tube Ice Inc., an ice manufacturing company in the Philippines.
    Based on this business data, write a SHORT 2-3 sentence executive summary in plain English. Be specific with numbers. Use Philippine Peso (₱).

    Sales this month: ₱'.number_format($data['sales']['this_month_total']).'
    Month-over-month change: '.($data['sales']['mom_change_pct'] ?? 'N/A').'%
    Total deliveries: '.$data['deliveries']['total'].' ('.$data['deliveries']['delivery_rate_pct'].'% delivery rate)
    Inventory: '.$data['inventory']['out_of_stock'].' out of stock, '.$data['inventory']['low_stock'].' low stock items
    Attendance today: '.$data['attendance']['total_in'].' / '.$data['attendance']['total_employees'].' employees present
    Overdue receivables: ₱'.number_format($data['overdue']['total_overdue_amount']).' across '.$data['overdue']['overdue_customers'].' customer(s)
    HR memos this month: '.$data['discipline']['memos_this_month'].' ('.$data['discipline']['missed_time_outs_this_month'].' for missed Time Outs, '.$data['discipline']['zero_tolerance_this_month'].' zero-tolerance), '.$data['discipline']['drafts'].' drafts waiting for HR, '.$data['discipline']['pending_investigations'].' employee(s) under investigation
    Urgent top-ups: '.$data['same_day']['top_ups_today'].' today, '.$data['same_day']['top_ups_30_days'].' in 30 days; sacks added '.$data['same_day']['sacks_added_30_days'].', reduced '.$data['same_day']['sacks_reduced_30_days'].' in 30 days (store requests)

    Respond with ONLY the summary paragraph, no labels or headers.';
        $payload = [
            'model' => 'openai/gpt-oss-20b',
            'messages' => [
                ['role' => 'user', 'content' => $prompt],
            ],
            // gpt-oss is a reasoning model: part of the budget is used for
            // its hidden "thinking" before the answer. 300 was too small
            // and cut the summary mid-sentence.
            'max_tokens' => 1024,
            'temperature' => 0.7,
        ];
        $fingerprint = hash('sha256', json_encode($payload));
        $force = $request->boolean('refresh');

        $stored = Cache::get(self::AI_CACHE_KEY);
        if ($this->aiSummaryIsCurrent($stored, $fingerprint, $force)) {
            return $this->aiSummaryReply($stored);
        }

        // Read the key through config (env() returns null in production once
        // the config is cached). Falls back to env() for local development.
        $apiKey = config('services.groq.key') ?: env('GROQ_API_KEY');

        if (! $apiKey) {
            return $this->aiSummaryReply($stored, true);
        }

        // Groq asked us to wait (429): do not call it again before then.
        $waitUntil = (int) Cache::get(self::AI_WAIT_KEY, 0);
        if ($waitUntil > now()->timestamp) {
            return $this->aiSummaryBusy($stored, $waitUntil - now()->timestamp);
        }

        try {
            return Cache::lock(self::AI_LOCK_KEY, 45)->block(35, function () use ($payload, $fingerprint, $force, $apiKey) {
                // Another request may have made this summary while this one waited.
                $stored = Cache::get(self::AI_CACHE_KEY);
                if ($this->aiSummaryIsCurrent($stored, $fingerprint, $force)) {
                    return $this->aiSummaryReply($stored);
                }

                return $this->generateAiSummary($apiKey, $payload, $fingerprint, $stored);
            });
        } catch (LockTimeoutException) {
            return $this->aiSummaryReply(Cache::get(self::AI_CACHE_KEY), true);
        }
    }

    // The stored summary still fits: same fingerprint and, for a forced
    // refresh, made within the cooldown.
    private function aiSummaryIsCurrent(?array $stored, string $fingerprint, bool $force): bool
    {
        if (! $stored || ($stored['fingerprint'] ?? null) !== $fingerprint) {
            return false;
        }

        return ! $force
            || Carbon::parse($stored['generated_at'])->gt(now()->subSeconds(self::AI_FORCE_COOLDOWN));
    }

    private function generateAiSummary(string $apiKey, array $payload, string $fingerprint, ?array $stored)
    {
        try {
            $http = Http::timeout(30)
                ->withHeaders(['Authorization' => "Bearer {$apiKey}"]);

            // SSL verification is skipped ONLY on the local machine (old
            // Windows cURL certificate issue). Production always verifies.
            if (app()->environment('local')) {
                $http = $http->withoutVerifying();
            }

            $response = $http->post('https://api.groq.com/openai/v1/chat/completions', $payload);
        } catch (\Throwable $e) {
            Log::warning('Groq AI summary request failed', ['error' => $e->getMessage()]);

            return $this->aiSummaryReply($stored, true);
        }

        // Groq's free tier allows only a few requests a minute.
        if ($response->status() === 429) {
            preg_match('/try again in ([0-9.]+)s/i', (string) $response->json('error.message'), $wait);
            $seconds = isset($wait[1]) ? (int) ceil((float) $wait[1]) : 30;
            Cache::put(self::AI_WAIT_KEY, now()->timestamp + $seconds, $seconds);

            return $this->aiSummaryBusy($stored, $seconds);
        }

        if ($response->failed()) {
            // Details go to the server log only, never to the browser
            Log::warning('Groq AI summary returned an error', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            return $this->aiSummaryReply($stored, true);
        }

        $text = $response->json('choices.0.message.content');

        if (! is_string($text) || trim($text) === '') {
            return $this->aiSummaryReply($stored, true);
        }

        $stored = [
            'fingerprint' => $fingerprint,
            'summary' => $this->trimToCompleteSentence($text),
            'generated_at' => now()->toIso8601String(),
        ];
        Cache::forever(self::AI_CACHE_KEY, $stored);

        return $this->aiSummaryReply($stored);
    }

    // The stored summary (stale = Groq could not be asked this time), or
    // the "unavailable" text when there is none yet.
    private function aiSummaryReply(?array $stored, bool $stale = false, ?string $message = null)
    {
        return response()->json([
            'summary' => $stored['summary'] ?? 'AI summary unavailable at this time.',
            'generated_at' => $stored['generated_at'] ?? null,
            'stale' => $stored ? $stale : false,
            'message' => $message,
        ]);
    }

    // Groq said to wait: show the last summary if there is one, otherwise a 429.
    private function aiSummaryBusy(?array $stored, int $seconds)
    {
        $message = "The AI is busy. Try again in {$seconds} seconds.";

        if ($stored) {
            return $this->aiSummaryReply($stored, true, $message);
        }

        return $this->aiSummaryReply(null, false, $message)
            ->setStatusCode(429)
            ->header('Retry-After', (string) $seconds);
    }
}

# Review change request: decisions (2026-10-14)

Decisions made by the project owner for the review feedback (HR attendance,
leave, payroll, recruitment). Every value below is a setting, not hardcoded.

## Data and roles
| Topic | Decision |
|---|---|
| Employee ID | Keep the integer `id` as the internal key. `employee_id` (EMP-0001) becomes unique and is the main search, display, export and URL key. |
| Payroll roles | **HR approves the timesheet** of each cutoff. **Admin processes pay** (computes, marks Paid, payslip). No Accounting role. |
| Drivers | Stay a separate role (driver login). |

## Attendance and kiosk
| Topic | Decision |
|---|---|
| Schedule | Default shift 09:00–18:00, 8 hours/day, per employee. |
| Late | Grace 0 minutes; `late_minutes = floor((time_in - shift_start) / 60s)`, so 9:00:59 is on time. |
| Kiosk lock | 5 wrong PINs lock **that kiosk only** (own kiosk ID), indefinitely. Only an Admin PIN override on the kiosk unlocks it. |

## Leave
| Topic | Decision |
|---|---|
| Credits | 15 SIL a year, earned **0.5 per cutoff** (13 a year), balance capped at 15. Earned from the date the employee becomes regular. Unused credits do **not** carry over to the next year. |
| EL | Filed in hours. Paid when there are credits, otherwise unpaid (hours × hourly). |
| SL | Filed for past dates, at most **1 day after** returning. Needs **both** leave credits **and** a med cert (required upload). |
| No credits left | EL and VL can still be filed but are **unpaid** (deducted from pay and 13th month). SL cannot be filed without credits or without a med cert. |
| VL | Start date at least 14 days ahead. |
| All | Blocked while probationary; no overlapping requests. |

## Payroll
| Topic | Decision |
|---|---|
| Cutoff | Bi-weekly from anchor 2026-01-05 (same cycle as 2026-10-12). |
| Government deductions | `SPLIT_FIRST_TWO`: SSS, PhilHealth, Pag-IBIG 50/50 on the first two paydays of the month; none on a 3rd payday. |
| 13th month | Legal formula: (basic actually earned in the year − unpaid absences/leave) ÷ 12, prorated from hire date, basic only. TODO: adviser confirmation. |
| Referral | Record `referred_by_employee_id` only; bonuses added by hand as a payroll adjustment. |

## Retention
No automatic deletion. Inactive employees and timesheets are kept 2 years.
After 2 years Admin gets a review list and chooses per record: download CSV
then delete, keep in the database, or delete.

## Not now
Billable vs non-billable hours.

## Confirmed 2026-10-14
1. 0.5 credit per cutoff, balance capped at 15.
2. Credits start when the employee becomes regular.
3. SL needs credits and a med cert (required).
4. No carry-over of unused credits.

## Still open (settings, change in Admin > Settings)
| Decision | Now |
|---|---|
| Grace period | `attendance.grace_minutes` = 0 |
| Government deduction schedule | `payroll.gov_deduction_strategy` = SPLIT_FIRST_TWO (FIRST_PAYROLL_OF_MONTH available) |
| Monthly to daily | `payroll.monthly_to_daily_divisor` = 21.83 (matches the reviewer's 732.94; 12 x 261 would be 21.75) |
| 13th month | legal formula; allowances excluded; adviser to confirm |
| Referral payout | none automatic; Admin adds a payroll earning |
| Retention | `retention.years` = 2, reviewed by Admin |
| Work days for absences | `attendance.work_days` = Mon-Fri |
| Billable hours | not built |

## Notes for the adviser
- Holidays are not in the payroll yet (no holiday calendar).
- Night-shift workers without their own shift start are not checked for lateness.
- Timesheets can only be approved after the pay period ends; HR can approve again to recompute until Admin marks it paid.

# R3 (client feedback, 2026-10-15) — R3 wins over R1/R2

| Topic | Decision |
|---|---|
| Archive expiry | Setting `archive.expiry_action` = REVIEW (default: Admin decides per record, as before), ANONYMIZE or PURGE (a daily job applies it after 2 years). Every action logged. |
| Overtime | Counted from Time Out past the shift end, but paid only when HR approves it on the Timesheets page. |
| Monthly-rated on a worked holiday | Premium only: (multiplier − 1) × hours × hourly, since the monthly basic already pays the day. |
| Old "Night" shift | Default range 21:00–06:00 (setting); "Day" is 09:00–18:00. |
| Holiday pay | Client defaults in `pay_multipliers` (DOLE values noted); not worked = no pay and not absent. |
| Kiosk lockout | Admin and HR are notified (in-app and email). The attempted employee ID cannot be known at the PIN screen; kiosk ID, time and IP are logged. Admin can unlock from the Kiosk PIN page; HR only if `kiosk.hr_can_override` (default off). |
| Negative net pay | Never paid out negative. `payroll.negative_net_handling` = CARRY_OVER (default: deducted on the next cut-off) or EMPLOYER_SHOULDERED. Admin sees the shortfall on the record and payslip. |
| Payroll notes | Removed from the UI and hidden from the API (the old column stays for history). |

Still open for the client (defaults in place, editable in Admin > Settings):
- OT_ORDINARY is 1.00 (DOLE 1.25), OT_SPECIAL_HOLIDAY 1.30 (DOLE 1.69), OT_REGULAR_HOLIDAY 2.00 (DOLE 2.60).
- REGULAR_HOLIDAY_REST_DAY and DOUBLE_HOLIDAY are 2.00 until the client gives values (DOLE 2.60 and 3.00).
- SPECIAL_WORKING_DAY_WORKED is 1.30 per the client; DOLE treats it as an ordinary day (1.00).
- Whether a monthly-rated employee loses pay for an unworked holiday (`payroll.monthly_unworked_holiday_deduct`, default no).
- Eid'l Adha 2026 is not seeded; HR adds it when it is proclaimed.

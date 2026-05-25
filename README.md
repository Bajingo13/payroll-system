# payroll-system

## Attendance, OT, and Shift Scheduling

This repository now includes:

- Real-time attendance logging (`/api/attendance/clock`)
- Attendance record listing and summary (`/api/attendance/records`, `/api/attendance/summary`)
- Overtime hour updates for attendance (`/api/attendance/overtime`)
- Shift scheduling management (`/api/shifts`)

New tables used by this feature:

- `employee_shift_schedules`
- `employee_attendance_records`

Reference SQL definitions are available in:

- `Database/payroll_system_employee_shift_schedules.sql`
- `Database/payroll_system_employee_attendance_records.sql`
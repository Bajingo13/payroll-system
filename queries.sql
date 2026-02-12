USE payroll_system;

SHOW tables;
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_type = 'BASE TABLE';
  
SHOW CREATE TABLE employee_contacts;

SELECT * FROM users;
SELECT * FROM employees;
SELECT * FROM employee_dependents;
SELECT * FROM employee_payroll;
SELECT * FROM payroll_periods;
SELECT * FROM employee_employment WHERE employee_id IN (16, 69);
SELECT e.emp_code, ep.*, eps.payroll_period FROM employee_employment ep
	LEFT JOIN employees e ON ep.employee_id = e.employee_id
	LEFT JOIN employee_payroll_settings eps ON ep.employee_id = eps.employee_id
	WHERE payroll_period = 'Semi-Monthly' AND emp_code IN ('EMP-001', 'EMP-012', 'EMP-018', 'EMP-022', 'EMP-023', 'EMP-025', 'EMP-027');
SELECT * FROM employee_tax_insurance WHERE employee_id IN (16, 69);
SELECT * FROM tax_exemptions_table;
SELECT * FROM employee_accounts;
SELECT * FROM employees WHERE emp_code = 0;
SELECT COUNT(*) FROM employees;

SELECT * FROM contribution_types;
SELECT * FROM employee_contributions WHERE employee_id = 16;

SELECT * FROM employee_allowances WHERE employee_id = 16;
SELECT * FROM employee_deductions WHERE employee_id = 16;
SELECT* FROM allowance_types;
SELECT * FROM deduction_types;
SHOW CREATE TABLE employee_payroll_allowances;
DESCRIBE employee_payroll_allowances;
SELECT * FROM employee_payroll_allowances;
SELECT * FROM employee_payroll_deductions;
SELECT * FROM payroll_ot_nd;
SELECT * FROM payroll_ot_nd_adjustments;
SELECT * FROM payroll_attendance_adjustments;
SELECT * FROM payroll_runs;
SELECT * FROM employee_payroll;
SELECT * FROM employee_contributions;
UPDATE employee_payroll SET payroll_status = 'Active' WHERE payroll_id IN (2, 3);
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'employee_accounts';
SELECT * FROM audit_logs;
SHOW COLUMNS FROM employees LIKE 'status';
SELECT e.employee_id, e.status, eps.payroll_period FROM employees e LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id WHERE payroll_period = "Semi-Monthly";


-- DELETE FROM employee_payroll_allowances WHERE payroll_id = 1;
-- DELETE FROM employee_payroll_deductions WHERE payroll_id = 1;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE employee_payroll;
TRUNCATE TABLE employee_payroll_allowances;
TRUNCATE TABLE employee_payroll_deductions;
TRUNCATE TABLE payroll_runs;
TRUNCATE TABLE payroll_ot_nd;
TRUNCATE TABLE payroll_ot_nd_adjustments;
TRUNCATE TABLE payroll_attendance_adjustments;
SET FOREIGN_KEY_CHECKS = 1;

SELECT * FROM employee_payroll_settings;

SELECT * FROM payroll_years;
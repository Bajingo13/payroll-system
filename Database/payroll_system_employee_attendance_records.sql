-- Table structure for table `employee_attendance_records`

DROP TABLE IF EXISTS `employee_attendance_records`;
CREATE TABLE `employee_attendance_records` (
  `attendance_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `shift_id` int DEFAULT NULL,
  `attendance_date` date NOT NULL,
  `time_in` datetime DEFAULT NULL,
  `break_out` datetime DEFAULT NULL,
  `break_in` datetime DEFAULT NULL,
  `time_out` datetime DEFAULT NULL,
  `worked_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `overtime_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `status` enum('Present','Late','Absent','Incomplete') NOT NULL DEFAULT 'Incomplete',
  `source` varchar(50) NOT NULL DEFAULT 'manual',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`attendance_id`),
  UNIQUE KEY `uk_employee_attendance_date` (`employee_id`,`attendance_date`),
  KEY `idx_attendance_date` (`attendance_date`),
  KEY `idx_attendance_shift` (`shift_id`),
  CONSTRAINT `employee_attendance_records_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_attendance_records_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `employee_shift_schedules` (`shift_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

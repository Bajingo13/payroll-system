-- Table structure for table `employee_shift_schedules`

DROP TABLE IF EXISTS `employee_shift_schedules`;
CREATE TABLE `employee_shift_schedules` (
  `shift_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `shift_date` date NOT NULL,
  `shift_name` varchar(100) NOT NULL DEFAULT 'Regular Shift',
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `break_start` time DEFAULT NULL,
  `break_end` time DEFAULT NULL,
  `is_rest_day` tinyint(1) NOT NULL DEFAULT '0',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`shift_id`),
  UNIQUE KEY `uk_employee_shift_date` (`employee_id`,`shift_date`),
  KEY `idx_shift_date` (`shift_date`),
  CONSTRAINT `employee_shift_schedules_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

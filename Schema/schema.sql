-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: payroll_system
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `allowance_types`
--

DROP TABLE IF EXISTS `allowance_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `allowance_types` (
  `allowance_type_id` int NOT NULL AUTO_INCREMENT,
  `allowance_name` varchar(150) NOT NULL,
  `is_taxable` tinyint(1) NOT NULL DEFAULT '1',
  `default_amount` decimal(10,2) DEFAULT '0.00',
  `date_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`allowance_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `admin_name` varchar(100) DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `log_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1612 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contribution_types`
--

DROP TABLE IF EXISTS `contribution_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contribution_types` (
  `contribution_type_id` int NOT NULL AUTO_INCREMENT,
  `contribution_name` varchar(50) NOT NULL,
  PRIMARY KEY (`contribution_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `deduction_types`
--

DROP TABLE IF EXISTS `deduction_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `deduction_types` (
  `deduction_type_id` int NOT NULL AUTO_INCREMENT,
  `deduction_name` varchar(150) NOT NULL,
  `default_amount` decimal(10,2) DEFAULT '0.00',
  `date_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`deduction_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_accounts`
--

DROP TABLE IF EXISTS `employee_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_accounts` (
  `account_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `machine_id` varchar(50) DEFAULT NULL,
  `sss_no` varchar(50) DEFAULT NULL,
  `gsis_no` varchar(50) DEFAULT NULL,
  `pagibig_no` varchar(50) DEFAULT NULL,
  `philhealth_no` varchar(50) DEFAULT NULL,
  `tin_no` varchar(50) DEFAULT NULL,
  `branch_code` varchar(50) DEFAULT NULL,
  `atm_no` varchar(50) DEFAULT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_branch` varchar(100) DEFAULT NULL,
  `projects` varchar(150) DEFAULT NULL,
  `salary_type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`account_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_accounts_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_allowances`
--

DROP TABLE IF EXISTS `employee_allowances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_allowances` (
  `emp_allowance_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `allowance_type_id` int NOT NULL,
  `period` enum('Weekly','Monthly','First Half','Second Half','Both') NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`emp_allowance_id`),
  KEY `employee_id` (`employee_id`),
  KEY `allowance_type_id` (`allowance_type_id`),
  CONSTRAINT `employee_allowances_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_allowances_ibfk_2` FOREIGN KEY (`allowance_type_id`) REFERENCES `allowance_types` (`allowance_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=800 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_contacts`
--

DROP TABLE IF EXISTS `employee_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_contacts` (
  `contact_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `tel_no` varchar(50) DEFAULT NULL,
  `mobile_no` varchar(50) DEFAULT NULL,
  `fax_no` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `website` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`contact_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_contacts_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_contributions`
--

DROP TABLE IF EXISTS `employee_contributions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_contributions` (
  `emp_contribution_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `contribution_type_id` int NOT NULL,
  `enabled` tinyint(1) DEFAULT '0',
  `start_date` date DEFAULT NULL,
  `period` varchar(50) DEFAULT NULL,
  `type_option` varchar(50) DEFAULT NULL,
  `computation` varchar(100) DEFAULT NULL,
  `ee_share` decimal(10,2) DEFAULT '0.00',
  `er_share` decimal(10,2) DEFAULT '0.00',
  `ecc` decimal(10,2) DEFAULT '0.00',
  `annualize` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`emp_contribution_id`),
  KEY `contribution_type_id` (`contribution_type_id`),
  KEY `employee_contributions_ibfk_1` (`employee_id`),
  CONSTRAINT `employee_contributions_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_contributions_ibfk_2` FOREIGN KEY (`contribution_type_id`) REFERENCES `contribution_types` (`contribution_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=137 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_deductions`
--

DROP TABLE IF EXISTS `employee_deductions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_deductions` (
  `emp_deduction_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `deduction_type_id` int NOT NULL,
  `period` enum('Weekly','Monthly','First Half','Second Half','Both') NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`emp_deduction_id`),
  KEY `employee_id` (`employee_id`),
  KEY `deduction_type_id` (`deduction_type_id`),
  CONSTRAINT `employee_deductions_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_deductions_ibfk_2` FOREIGN KEY (`deduction_type_id`) REFERENCES `deduction_types` (`deduction_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=257 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_dependents`
--

DROP TABLE IF EXISTS `employee_dependents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_dependents` (
  `dependent_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  PRIMARY KEY (`dependent_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_dependents_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=686 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_employment`
--

DROP TABLE IF EXISTS `employee_employment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_employment` (
  `employment_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `company` varchar(150) DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `branch` varchar(100) DEFAULT NULL,
  `division` varchar(100) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `class` varchar(100) DEFAULT NULL,
  `position` varchar(100) DEFAULT NULL,
  `employee_type` varchar(100) DEFAULT NULL,
  `training_date` date DEFAULT NULL,
  `date_hired` date DEFAULT NULL,
  `date_regular` date DEFAULT NULL,
  `date_resigned` date DEFAULT NULL,
  `date_terminated` date DEFAULT NULL,
  `end_of_contract` date DEFAULT NULL,
  `rehired_date` date DEFAULT NULL,
  `rehired` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`employment_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_employment_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_payroll`
--

DROP TABLE IF EXISTS `employee_payroll`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_payroll` (
  `payroll_id` int NOT NULL AUTO_INCREMENT,
  `run_id` int DEFAULT NULL,
  `employee_id` int DEFAULT NULL,
  `basic_salary` decimal(10,2) DEFAULT NULL,
  `absence_time` int NOT NULL DEFAULT '0',
  `absence_deduction` decimal(10,2) DEFAULT NULL,
  `late_time` int NOT NULL DEFAULT '0',
  `late_deduction` decimal(10,2) DEFAULT NULL,
  `undertime` int NOT NULL DEFAULT '0',
  `undertime_deduction` decimal(10,2) DEFAULT NULL,
  `overtime` decimal(10,2) DEFAULT NULL,
  `taxable_allowances` decimal(10,2) DEFAULT NULL,
  `non_taxable_allowances` decimal(10,2) DEFAULT NULL,
  `adj_comp` decimal(10,2) DEFAULT NULL,
  `adj_non_comp` decimal(10,2) DEFAULT NULL,
  `total_leaves_used` decimal(10,2) DEFAULT NULL,
  `gsis_employee` decimal(10,2) DEFAULT NULL,
  `gsis_employer` decimal(10,2) DEFAULT NULL,
  `gsis_ecc` decimal(10,2) DEFAULT NULL,
  `sss_employee` decimal(10,2) DEFAULT NULL,
  `sss_employer` decimal(10,2) DEFAULT NULL,
  `sss_ecc` decimal(10,2) DEFAULT NULL,
  `pagibig_employee` decimal(10,2) DEFAULT NULL,
  `pagibig_employer` decimal(10,2) DEFAULT NULL,
  `pagibig_ecc` decimal(10,2) DEFAULT NULL,
  `philhealth_employee` decimal(10,2) DEFAULT NULL,
  `philhealth_employer` decimal(10,2) DEFAULT NULL,
  `philhealth_ecc` decimal(10,2) DEFAULT NULL,
  `tax_withheld` decimal(10,2) DEFAULT NULL,
  `deductions` decimal(10,2) DEFAULT NULL,
  `loans` decimal(10,2) DEFAULT NULL,
  `other_deductions` decimal(10,2) DEFAULT NULL,
  `premium_adj` decimal(10,2) DEFAULT NULL,
  `ytd_sss` decimal(10,2) DEFAULT NULL,
  `ytd_wtax` decimal(10,2) DEFAULT NULL,
  `ytd_philhealth` decimal(10,2) DEFAULT NULL,
  `ytd_gsis` decimal(10,2) DEFAULT NULL,
  `ytd_pagibig` decimal(10,2) DEFAULT NULL,
  `ytd_gross` decimal(10,2) DEFAULT NULL,
  `payroll_status` enum('Active','Hold') DEFAULT 'Active',
  `gross_pay` decimal(10,2) DEFAULT NULL,
  `total_deductions` decimal(10,2) DEFAULT NULL,
  `net_pay` decimal(10,2) DEFAULT NULL,
  `date_generated` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payroll_id`),
  KEY `employee_id` (`employee_id`),
  KEY `run_id` (`run_id`),
  CONSTRAINT `employee_payroll_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_payroll_ibfk_6` FOREIGN KEY (`run_id`) REFERENCES `payroll_runs` (`run_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_payroll_allowances`
--

DROP TABLE IF EXISTS `employee_payroll_allowances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_payroll_allowances` (
  `emp_payroll_allowance_id` int NOT NULL AUTO_INCREMENT,
  `source_emp_allowance_id` int DEFAULT NULL,
  `payroll_id` int DEFAULT NULL,
  `employee_id` int NOT NULL,
  `allowance_type_id` int NOT NULL,
  `period` enum('Weekly','Monthly','First Half','Second Half','Both') NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`emp_payroll_allowance_id`),
  KEY `employee_id` (`employee_id`),
  KEY `allowance_type_id` (`allowance_type_id`),
  KEY `fk_payroll_allowance` (`payroll_id`),
  CONSTRAINT `employee_payroll_allowances_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_payroll_allowances_ibfk_2` FOREIGN KEY (`allowance_type_id`) REFERENCES `allowance_types` (`allowance_type_id`),
  CONSTRAINT `fk_payroll_allowance` FOREIGN KEY (`payroll_id`) REFERENCES `employee_payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_payroll_deductions`
--

DROP TABLE IF EXISTS `employee_payroll_deductions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_payroll_deductions` (
  `emp_payroll_deduction_id` int NOT NULL AUTO_INCREMENT,
  `source_emp_deduction_id` int DEFAULT NULL,
  `payroll_id` int DEFAULT NULL,
  `employee_id` int NOT NULL,
  `deduction_type_id` int NOT NULL,
  `period` enum('Weekly','Monthly','First Half','Second Half','Both') NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`emp_payroll_deduction_id`),
  KEY `employee_id` (`employee_id`),
  KEY `deduction_type_id` (`deduction_type_id`),
  KEY `fk_payroll_deduction` (`payroll_id`),
  CONSTRAINT `employee_payroll_deductions_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_payroll_deductions_ibfk_2` FOREIGN KEY (`deduction_type_id`) REFERENCES `deduction_types` (`deduction_type_id`),
  CONSTRAINT `fk_payroll_deduction` FOREIGN KEY (`payroll_id`) REFERENCES `employee_payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_payroll_settings`
--

DROP TABLE IF EXISTS `employee_payroll_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_payroll_settings` (
  `setting_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `payroll_period` enum('Weekly','Semi-Monthly','Monthly') NOT NULL,
  `payroll_rate` enum('Piece Rate','Hourly Rate','Daily Rate','Weekly Rate','Monthly Rate') NOT NULL,
  `ot_rate` enum('STANDARD OT RATE') DEFAULT 'STANDARD OT RATE',
  `days_in_year` int DEFAULT '313',
  `days_in_week` int DEFAULT NULL,
  `hours_in_day` int DEFAULT '8',
  `week_in_year` int DEFAULT '52',
  `strict_no_overtime` tinyint(1) DEFAULT '0',
  `days_in_year_ot` int DEFAULT '313',
  `rate_basis_ot` decimal(10,2) DEFAULT '0.00',
  `main_computation` text,
  `basis_absences` text,
  `basis_overtime` text,
  PRIMARY KEY (`setting_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_payroll_settings_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_tax_insurance`
--

DROP TABLE IF EXISTS `employee_tax_insurance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_tax_insurance` (
  `tax_insurance_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `tax_status` varchar(50) DEFAULT NULL,
  `tax_exemption` decimal(10,2) DEFAULT '0.00',
  `insurance` decimal(10,2) DEFAULT '0.00',
  `regional_minimum_wage_rate_id` int DEFAULT NULL,
  `date_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tax_insurance_id`),
  KEY `employee_id` (`employee_id`),
  KEY `regional_minimum_wage_rate_id` (`regional_minimum_wage_rate_id`),
  CONSTRAINT `employee_tax_insurance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_tax_insurance_ibfk_2` FOREIGN KEY (`regional_minimum_wage_rate_id`) REFERENCES `regional_minimum_wage_rates` (`regional_minimum_wage_rate_id`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `employee_id` int NOT NULL AUTO_INCREMENT,
  `emp_code` varchar(20) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `gender` enum('Male','Female','Other') DEFAULT NULL,
  `civil_status` varchar(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `street` varchar(150) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `zip_code` varchar(20) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Active',
  `date_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `emp_code` (`emp_code`)
) ENGINE=InnoDB AUTO_INCREMENT=111 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ot_nd_types`
--

DROP TABLE IF EXISTS `ot_nd_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ot_nd_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `rate` decimal(5,2) NOT NULL,
  `is_nd` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`,`is_nd`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pagibig_contribution_table`
--

DROP TABLE IF EXISTS `pagibig_contribution_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagibig_contribution_table` (
  `pagibig_id` int NOT NULL AUTO_INCREMENT,
  `salary_low` decimal(10,2) NOT NULL,
  `salary_high` decimal(10,2) NOT NULL,
  `ee_share` decimal(10,2) NOT NULL,
  `er_share` decimal(10,2) NOT NULL,
  `date_effective` date DEFAULT '2024-01-01',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`pagibig_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_attendance_adjustments`
--

DROP TABLE IF EXISTS `payroll_attendance_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_attendance_adjustments` (
  `adj_id` int NOT NULL AUTO_INCREMENT,
  `payroll_id` int NOT NULL,
  `run_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `basic_salary_time` int NOT NULL DEFAULT '0',
  `basic_salary_amt` decimal(10,2) NOT NULL DEFAULT '0.00',
  `absences_time` int NOT NULL DEFAULT '0',
  `absences_amt` decimal(10,2) NOT NULL DEFAULT '0.00',
  `late_time` int NOT NULL DEFAULT '0',
  `late_amt` decimal(10,2) NOT NULL DEFAULT '0.00',
  `undertime_time` int NOT NULL DEFAULT '0',
  `undertime_amt` decimal(10,2) NOT NULL DEFAULT '0.00',
  `others_amt` decimal(10,2) NOT NULL DEFAULT '0.00',
  `gsis_emp` decimal(10,2) NOT NULL DEFAULT '0.00',
  `gsis_employer` decimal(10,2) NOT NULL DEFAULT '0.00',
  `gsis_ecc` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sss_emp` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sss_employer` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sss_ecc` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagibig_emp` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagibig_employer` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagibig_ecc` decimal(10,2) NOT NULL DEFAULT '0.00',
  `philhealth_emp` decimal(10,2) NOT NULL DEFAULT '0.00',
  `philhealth_employer` decimal(10,2) NOT NULL DEFAULT '0.00',
  `philhealth_ecc` decimal(10,2) NOT NULL DEFAULT '0.00',
  `tax_withheld` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`adj_id`),
  KEY `payroll_id` (`payroll_id`),
  CONSTRAINT `payroll_attendance_adjustments_ibfk_1` FOREIGN KEY (`payroll_id`) REFERENCES `employee_payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_groups`
--

DROP TABLE IF EXISTS `payroll_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_groups` (
  `group_id` int NOT NULL AUTO_INCREMENT,
  `group_name` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_months`
--

DROP TABLE IF EXISTS `payroll_months`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_months` (
  `month_id` int NOT NULL AUTO_INCREMENT,
  `month_name` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`month_id`),
  UNIQUE KEY `month_name` (`month_name`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_ot_nd`
--

DROP TABLE IF EXISTS `payroll_ot_nd`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_ot_nd` (
  `ot_nd_id` int NOT NULL AUTO_INCREMENT,
  `payroll_id` int NOT NULL,
  `run_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `rg_rate` decimal(6,2) NOT NULL,
  `rg_ot` decimal(6,2) NOT NULL,
  `rd_rate` decimal(6,2) NOT NULL,
  `rd_ot` decimal(6,2) NOT NULL,
  `sd_rate` decimal(6,2) NOT NULL,
  `sd_ot` decimal(6,2) NOT NULL,
  `sdrd_rate` decimal(6,2) NOT NULL,
  `sdrd_ot` decimal(6,2) NOT NULL,
  `hd_rate` decimal(6,2) NOT NULL,
  `hd_ot` decimal(6,2) NOT NULL,
  `hdrd_rate` decimal(6,2) NOT NULL,
  `hdrd_ot` decimal(6,2) NOT NULL,
  `rg_rate_nd` decimal(6,2) NOT NULL,
  `rg_ot_nd` decimal(6,2) NOT NULL,
  `rd_rate_nd` decimal(6,2) NOT NULL,
  `rd_ot_nd` decimal(6,2) NOT NULL,
  `sd_rate_nd` decimal(6,2) NOT NULL,
  `sd_ot_nd` decimal(6,2) NOT NULL,
  `sdrd_rate_nd` decimal(6,2) NOT NULL,
  `sdrd_ot_nd` decimal(6,2) NOT NULL,
  `hd_rate_nd` decimal(6,2) NOT NULL,
  `hd_ot_nd` decimal(6,2) NOT NULL,
  `hdrd_rate_nd` decimal(6,2) NOT NULL,
  `hdrd_ot_nd` decimal(6,2) NOT NULL,
  `rg_rate_time` int NOT NULL DEFAULT '0',
  `rg_ot_time` int NOT NULL DEFAULT '0',
  `rd_rate_time` int NOT NULL DEFAULT '0',
  `rd_ot_time` int NOT NULL DEFAULT '0',
  `sd_rate_time` int NOT NULL DEFAULT '0',
  `sd_ot_time` int NOT NULL DEFAULT '0',
  `sdrd_rate_time` int NOT NULL DEFAULT '0',
  `sdrd_ot_time` int NOT NULL DEFAULT '0',
  `hd_rate_time` int NOT NULL DEFAULT '0',
  `hd_ot_time` int NOT NULL DEFAULT '0',
  `hdrd_rate_time` int NOT NULL DEFAULT '0',
  `hdrd_ot_time` int NOT NULL DEFAULT '0',
  `rg_rate_nd_time` int NOT NULL DEFAULT '0',
  `rg_ot_nd_time` int NOT NULL DEFAULT '0',
  `rd_rate_nd_time` int NOT NULL DEFAULT '0',
  `rd_ot_nd_time` int NOT NULL DEFAULT '0',
  `sd_rate_nd_time` int NOT NULL DEFAULT '0',
  `sd_ot_nd_time` int NOT NULL DEFAULT '0',
  `sdrd_rate_nd_time` int NOT NULL DEFAULT '0',
  `sdrd_ot_nd_time` int NOT NULL DEFAULT '0',
  `hd_rate_nd_time` int NOT NULL DEFAULT '0',
  `hd_ot_nd_time` int NOT NULL DEFAULT '0',
  `hdrd_rate_nd_time` int NOT NULL DEFAULT '0',
  `hdrd_ot_nd_time` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`ot_nd_id`),
  KEY `payroll_id` (`payroll_id`),
  CONSTRAINT `payroll_ot_nd_ibfk_1` FOREIGN KEY (`payroll_id`) REFERENCES `employee_payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_ot_nd_adjustments`
--

DROP TABLE IF EXISTS `payroll_ot_nd_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_ot_nd_adjustments` (
  `adj_id` int NOT NULL AUTO_INCREMENT,
  `payroll_id` int NOT NULL,
  `run_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `ot_adj_rg_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_rg_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_rd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_rd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_sd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_sd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_sdrd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_sdrd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_hd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_hd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_hdrd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_hdrd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_rg_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_rg_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_rd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_rd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_sd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_sd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_sdrd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_sdrd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_hd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_hd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_hdrd_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `nd_adj_hdrd_ot` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_adj_rg_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_rg_ot_time` int NOT NULL DEFAULT '0',
  `ot_adj_rd_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_rd_ot_time` int NOT NULL DEFAULT '0',
  `ot_adj_sd_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_sd_ot_time` int NOT NULL DEFAULT '0',
  `ot_adj_sdrd_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_sdrd_ot_time` int NOT NULL DEFAULT '0',
  `ot_adj_hd_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_hd_ot_time` int NOT NULL DEFAULT '0',
  `ot_adj_hdrd_rate_time` int NOT NULL DEFAULT '0',
  `ot_adj_hdrd_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_rg_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_rg_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_rd_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_rd_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_sd_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_sd_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_sdrd_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_sdrd_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_hd_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_hd_ot_time` int NOT NULL DEFAULT '0',
  `nd_adj_hdrd_rate_time` int NOT NULL DEFAULT '0',
  `nd_adj_hdrd_ot_time` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`adj_id`),
  KEY `payroll_id` (`payroll_id`),
  CONSTRAINT `payroll_ot_nd_adjustments_ibfk_1` FOREIGN KEY (`payroll_id`) REFERENCES `employee_payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_periods`
--

DROP TABLE IF EXISTS `payroll_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_periods` (
  `period_id` int NOT NULL AUTO_INCREMENT,
  `group_id` int DEFAULT NULL,
  `period_name` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`period_id`),
  KEY `group_id` (`group_id`),
  CONSTRAINT `payroll_periods_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `payroll_groups` (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_runs`
--

DROP TABLE IF EXISTS `payroll_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_runs` (
  `run_id` int NOT NULL AUTO_INCREMENT,
  `group_id` varchar(50) NOT NULL,
  `period_id` varchar(50) NOT NULL,
  `month_id` varchar(20) NOT NULL,
  `year_id` varchar(10) NOT NULL,
  `payroll_range` varchar(100) DEFAULT NULL,
  `status` enum('Pending','Generated','Completed','Locked') DEFAULT 'Pending',
  `date_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `date_completed` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`run_id`),
  KEY `group_id` (`group_id`),
  KEY `period_id` (`period_id`),
  KEY `month_id` (`month_id`),
  KEY `year_id` (`year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_years`
--

DROP TABLE IF EXISTS `payroll_years`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_years` (
  `year_id` int NOT NULL AUTO_INCREMENT,
  `year_value` int DEFAULT NULL,
  PRIMARY KEY (`year_id`),
  UNIQUE KEY `year_value` (`year_value`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `philhealth_contribution_table`
--

DROP TABLE IF EXISTS `philhealth_contribution_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `philhealth_contribution_table` (
  `philhealth_id` int NOT NULL AUTO_INCREMENT,
  `salary_low` decimal(10,2) NOT NULL,
  `salary_high` decimal(10,2) NOT NULL,
  `ee_share` decimal(10,2) NOT NULL,
  `er_share` decimal(10,2) NOT NULL,
  `date_effective` date DEFAULT '2024-01-01',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`philhealth_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `regional_minimum_wage_rates`
--

DROP TABLE IF EXISTS `regional_minimum_wage_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `regional_minimum_wage_rates` (
  `regional_minimum_wage_rate_id` int NOT NULL AUTO_INCREMENT,
  `region_code` varchar(15) NOT NULL,
  `region_name` varchar(50) NOT NULL,
  `wage_rate` decimal(10,2) NOT NULL,
  `date_effective` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`regional_minimum_wage_rate_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sss_contribution_table`
--

DROP TABLE IF EXISTS `sss_contribution_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sss_contribution_table` (
  `sss_id` int NOT NULL AUTO_INCREMENT,
  `salary_low` decimal(10,2) NOT NULL,
  `salary_high` decimal(10,2) NOT NULL,
  `ee_share` decimal(10,2) NOT NULL,
  `er_share` decimal(10,2) NOT NULL,
  `ecc` decimal(10,2) NOT NULL DEFAULT '0.00',
  `date_effective` date DEFAULT '2024-01-01',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`sss_id`)
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_lists`
--

DROP TABLE IF EXISTS `system_lists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_lists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category` varchar(50) NOT NULL,
  `value` varchar(100) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=94 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tax_exemptions_table`
--

DROP TABLE IF EXISTS `tax_exemptions_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tax_exemptions_table` (
  `tax_exemption_id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `description` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`tax_exemption_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `full_name` varchar(150) DEFAULT NULL,
  `role` varchar(50) DEFAULT 'System Administrator',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `withholding_tax_table`
--

DROP TABLE IF EXISTS `withholding_tax_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `withholding_tax_table` (
  `withholding_tax_id` int NOT NULL AUTO_INCREMENT,
  `pay_period` varchar(50) NOT NULL,
  `status` varchar(10) NOT NULL,
  `tax_low` decimal(10,2) NOT NULL,
  `tax_high` decimal(10,2) NOT NULL,
  `percent_over` decimal(10,2) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`withholding_tax_id`)
) ENGINE=InnoDB AUTO_INCREMENT=267 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:36:03

-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: payroll_system
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

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
-- Dumping data for table `employee_payroll`
--

LOCK TABLES `employee_payroll` WRITE;
/*!40000 ALTER TABLE `employee_payroll` DISABLE KEYS */;
INSERT INTO `employee_payroll` VALUES (2,1,29,8000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,360.00,760.00,10.00,100.00,100.00,234.00,200.00,200.00,0.00,34.00,0.00,0.00,0.00,0.00,180.00,17.00,100.00,0.00,50.00,8000.00,'Active',8000.00,347.00,7653.00,'2026-02-10 02:56:40'),(3,1,36,5000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,225.00,475.00,10.00,100.00,100.00,56.00,200.00,200.00,0.00,453.00,0.00,0.00,0.00,0.00,112.50,226.50,100.00,0.00,50.00,5000.00,'Active',5000.00,489.00,4511.00,'2026-02-10 02:56:40'),(4,1,41,5000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,225.00,475.00,10.00,100.00,100.00,568.00,200.00,200.00,0.00,965.00,0.00,0.00,0.00,0.00,112.50,482.50,100.00,0.00,50.00,5000.00,'Active',5000.00,745.00,4255.00,'2026-02-10 02:56:40'),(5,1,71,500.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,500.00,'Active',500.00,0.00,500.00,'2026-02-10 04:41:24'),(6,1,64,5000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,5000.00,'Active',5000.00,0.00,5000.00,'2026-02-10 07:50:52'),(7,1,68,6156207.00,0,0.00,0,0.00,0,0.00,0.00,61000.00,1500.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1000.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,6218707.00,'Active',6218707.00,1000.00,6217707.00,'2026-02-10 07:50:52'),(9,1,55,25000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,25000.00,'Active',25000.00,0.00,25000.00,'2026-02-10 07:50:52'),(12,1,47,500.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,500.00,'Active',500.00,0.00,500.00,'2026-02-10 07:50:52'),(16,1,52,5000.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,5000.00,'Active',5000.00,0.00,5000.00,'2026-02-10 07:50:52'),(17,1,62,2500.00,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2500.00,'Active',2500.00,0.00,2500.00,'2026-02-10 07:50:52'),(18,1,69,6156210.50,0,0.00,0,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,6156210.50,'Active',6156210.50,0.00,6156210.50,'2026-02-10 07:50:52'),(19,1,16,8500.00,0,0.00,0,0.00,0,0.00,0.00,500.50,250.50,0.00,0.00,0.00,0.00,0.00,0.00,382.50,807.50,10.00,100.00,100.00,100.00,100.00,100.00,0.00,100.00,500.50,0.00,0.00,0.00,191.25,50.00,50.00,0.00,50.00,9251.00,'Active',9251.00,841.75,8409.25,'2026-02-10 07:55:40');
/*!40000 ALTER TABLE `employee_payroll` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:03

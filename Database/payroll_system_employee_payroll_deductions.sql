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
-- Dumping data for table `employee_payroll_deductions`
--

LOCK TABLES `employee_payroll_deductions` WRITE;
/*!40000 ALTER TABLE `employee_payroll_deductions` DISABLE KEYS */;
INSERT INTO `employee_payroll_deductions` VALUES (3,254,19,16,1,'First Half',500.00),(4,256,19,16,1,'First Half',0.50),(5,171,7,68,1,'First Half',500.00),(6,172,7,68,1,'First Half',500.00);
/*!40000 ALTER TABLE `employee_payroll_deductions` ENABLE KEYS */;
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

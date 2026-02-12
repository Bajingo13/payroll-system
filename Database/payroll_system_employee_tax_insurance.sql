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
-- Dumping data for table `employee_tax_insurance`
--

LOCK TABLES `employee_tax_insurance` WRITE;
/*!40000 ALTER TABLE `employee_tax_insurance` DISABLE KEYS */;
INSERT INTO `employee_tax_insurance` VALUES (5,100,'SINGLE',50000.00,123.00,1,'2025-12-10 08:00:39'),(8,96,'MARRIED WITH 1 DEPENDENT',75000.00,0.00,12,'2025-12-10 08:10:53'),(9,91,NULL,0.00,0.00,NULL,'2025-12-10 08:18:50'),(10,93,NULL,0.00,0.00,NULL,'2025-12-10 08:19:46'),(11,97,NULL,NULL,0.00,NULL,'2025-12-10 08:21:25'),(15,16,'SINGLE WITH 2 DEPENDENTS',100000.00,1000.00,1,'2026-01-07 06:20:53'),(20,69,NULL,NULL,0.00,NULL,'2026-01-22 08:58:28'),(21,36,NULL,NULL,0.00,NULL,'2026-01-26 05:40:23'),(22,42,NULL,NULL,0.00,NULL,'2026-01-26 05:57:37'),(23,44,NULL,NULL,0.00,NULL,'2026-01-26 05:58:28'),(24,44,NULL,NULL,0.00,NULL,'2026-01-26 05:58:28'),(25,45,NULL,NULL,0.00,NULL,'2026-01-27 06:57:25'),(26,47,NULL,NULL,0.00,NULL,'2026-01-27 06:58:01'),(27,48,NULL,NULL,0.00,NULL,'2026-01-27 06:59:47'),(28,46,NULL,NULL,0.00,NULL,'2026-01-27 07:01:13'),(29,51,NULL,NULL,0.00,NULL,'2026-01-27 07:03:10'),(30,29,'HEAD OF THE FAMILY WITH 4 DEPENDENTS',150000.00,0.00,NULL,'2026-02-09 03:18:36'),(31,41,NULL,NULL,0.00,NULL,'2026-02-09 03:19:42');
/*!40000 ALTER TABLE `employee_tax_insurance` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:07

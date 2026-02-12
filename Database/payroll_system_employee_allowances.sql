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
-- Dumping data for table `employee_allowances`
--

LOCK TABLES `employee_allowances` WRITE;
/*!40000 ALTER TABLE `employee_allowances` DISABLE KEYS */;
INSERT INTO `employee_allowances` VALUES (100,84,5,'Weekly',1000.00),(101,84,5,'Weekly',1000.00),(102,84,7,'Weekly',30000.00),(103,84,7,'Weekly',30000.00),(104,84,5,'Weekly',4000.00),(105,84,6,'Weekly',500.00),(106,84,6,'Weekly',500.00),(132,86,7,'Monthly',30000.00),(133,86,5,'Monthly',500.00),(134,86,6,'Monthly',500.00),(135,86,6,'Monthly',500.00),(560,68,7,'Both',60000.00),(561,68,7,'Both',60000.00),(562,68,5,'Both',2000.00),(563,68,6,'Both',500.00),(564,68,6,'Both',500.00),(565,68,6,'First Half',1000.00),(566,68,6,'First Half',1000.00),(567,79,5,'Weekly',4000.00),(568,79,7,'Weekly',120000.00),(569,79,6,'Weekly',2000.00),(709,91,5,'Weekly',1000.00),(710,91,7,'Weekly',30000.00),(711,91,7,'Weekly',30000.00),(712,91,6,'Weekly',500.00),(794,16,5,'First Half',1000.00),(795,16,7,'Second Half',30000.00),(796,16,7,'Both',1.00),(797,16,6,'First Half',500.00),(798,16,6,'Second Half',1000.00),(799,16,6,'Both',1.00);
/*!40000 ALTER TABLE `employee_allowances` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:04

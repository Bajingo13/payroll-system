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
-- Dumping data for table `employee_accounts`
--

LOCK TABLES `employee_accounts` WRITE;
/*!40000 ALTER TABLE `employee_accounts` DISABLE KEYS */;
INSERT INTO `employee_accounts` VALUES (6,11,'','','','','','','','','','','',''),(7,12,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(11,16,'123','123','123','123','123','123','123','123','BDO','Intramuros','Client A','ADMIN'),(12,17,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(13,18,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14,19,'','','','','','','','','','','',''),(15,20,'','','','','','','','','','','',''),(23,28,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(24,29,'N/A',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(26,31,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'BDO','Intramuros','Client A','APPRENTICE'),(27,32,'','','','','','','','','','','',''),(28,33,'sample','sample','sample','','sample','sample','sample','sample','BPI','HO','Internal Payroll System','INDIRECT LABOR'),(29,34,'','','','','','','','','','','',''),(30,35,'','','','','','','','','','','',''),(31,36,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(32,37,'','','','','','','','','','','',''),(33,38,'','','','','','','','','','','',''),(34,39,'','','','','','','','','','','',''),(36,41,'N/A','N/A','N/A','N/A','N/A','N/A','N/A','N/A','BDO','Satellite Office','Client A','DIRECT LABOR'),(37,42,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(38,43,'','','','','','','','','','','',''),(39,44,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(40,45,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(41,46,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(42,47,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(43,48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(44,49,'','','','','','','','','','','',''),(45,50,'','','','','','','','','','','',''),(46,51,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(47,52,'sample','sample','sample','sample','sample','sample','sample','sample','BDO','Main Branch','Client A','DIRECT LABOR'),(48,53,'456','456','456','456','456','456','456','456','BDO','Arnaiz Ave Makati City','Client A','INDIRECT LABOR'),(49,54,'','','','','','','','','','','',''),(50,55,'Laptop-01','123','123','123','123','123','123','1234567890','BDO','Satellite Office','Client A','DIRECT LABOR'),(56,61,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(57,62,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(58,63,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(59,64,NULL,'1241',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(60,65,'','','','','','','','','','','',''),(63,68,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(64,69,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Client A','APPRENTICE'),(65,70,'sample','sample','sample','sample','sample','sample','sample','sample','BPI','Satellite Office','Client B','APPRENTICE'),(66,71,'','','','','','','','','','','',''),(68,73,'','','','','','','','','','','',''),(69,74,'sample','sample','sample','sample','sample','sample','sample','sample','BDO','Main Branch','Client B','DIRECT LABOR'),(70,75,'','','','','','','','','','','',''),(74,79,'sample','sample','sample','sample','sample','sample','123','sample','BDO','Main Branch','Client A','APPRENTICE'),(76,81,'sample','sample','sample','sample','sample','sample','sample','sample','BDO','Satellite Office','Client A','INDIRECT LABOR'),(78,83,'sample','sample','sample','sample','sample','sample','sample','sample','BDO','5F Shangri-la Plaza','Client A','ADMIN'),(79,84,'sample','sample','sample','sample','sample','sample','sample','sample','Metrobank','WCP','Internal Payroll System','INDIRECT LABOR'),(81,86,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(83,88,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(84,89,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(86,91,'sample','sample','sample','sample','sample','sample','sample','sample','BDO','WCP','Client B','ADMIN'),(88,93,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(89,94,'','','','','','','','','','','',''),(90,96,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(91,97,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(92,98,'','','','','','','','','','','',''),(94,100,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `employee_accounts` ENABLE KEYS */;
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

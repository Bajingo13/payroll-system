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
-- Dumping data for table `employee_payroll_settings`
--

LOCK TABLES `employee_payroll_settings` WRITE;
/*!40000 ALTER TABLE `employee_payroll_settings` DISABLE KEYS */;
INSERT INTO `employee_payroll_settings` VALUES (2,28,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,NULL,NULL,NULL),(3,29,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'16000',NULL,NULL),(5,31,'Weekly','Piece Rate',NULL,313,5,8,52,0,313,50.00,'1000',NULL,NULL),(6,32,'Weekly','Piece Rate','STANDARD OT RATE',313,5,8,52,0,313,NULL,'1000',NULL,NULL),(7,33,'Weekly','Piece Rate','STANDARD OT RATE',313,5,8,52,0,313,500.00,'20000',NULL,NULL),(8,34,'Semi-Monthly','Hourly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'1000',NULL,NULL),(9,35,'Semi-Monthly','Daily Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'1000',NULL,NULL),(10,36,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'10000',NULL,NULL),(11,37,'Weekly','Hourly Rate','STANDARD OT RATE',313,5,8,52,0,313,NULL,'1000',NULL,NULL),(12,38,'Semi-Monthly','Daily Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'1000',NULL,NULL),(13,39,'Weekly','Daily Rate','STANDARD OT RATE',313,5,8,52,0,313,NULL,'1000',NULL,NULL),(15,41,'Semi-Monthly','Weekly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,500.00,'10000',NULL,NULL),(16,42,'Semi-Monthly','Hourly Rate','STANDARD OT RATE',313,NULL,NULL,NULL,0,313,NULL,'1000',NULL,NULL),(17,43,'Weekly','Piece Rate','STANDARD OT RATE',313,5,NULL,NULL,0,NULL,NULL,'100',NULL,NULL),(18,44,'Semi-Monthly','Hourly Rate','STANDARD OT RATE',313,NULL,NULL,NULL,0,313,NULL,'1000',NULL,NULL),(19,45,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,NULL,NULL,0,313,NULL,'1000',NULL,NULL),(20,46,'Semi-Monthly','Monthly Rate',NULL,313,NULL,NULL,NULL,1,NULL,NULL,'1000',NULL,NULL),(21,47,'Semi-Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'1000',NULL,NULL),(22,48,'Semi-Monthly','Piece Rate',NULL,313,NULL,NULL,NULL,1,NULL,NULL,'1000',NULL,NULL),(23,49,'Semi-Monthly','Hourly Rate',NULL,313,NULL,NULL,NULL,0,NULL,NULL,'1000',NULL,NULL),(24,50,'Semi-Monthly','Piece Rate',NULL,313,NULL,NULL,NULL,0,NULL,NULL,'1000',NULL,NULL),(25,51,'Semi-Monthly','Hourly Rate',NULL,313,NULL,NULL,NULL,1,NULL,NULL,'1000',NULL,NULL),(26,52,'Semi-Monthly','Hourly Rate',NULL,346,NULL,85235,525325,0,NULL,NULL,'10000',NULL,NULL),(27,53,'Weekly','Monthly Rate',NULL,313,5,8,52,1,NULL,NULL,'50000',NULL,NULL),(28,54,'Weekly','Piece Rate',NULL,NULL,5,NULL,NULL,0,NULL,NULL,'1000',NULL,NULL),(29,55,'Semi-Monthly','Monthly Rate',NULL,313,NULL,8,52,0,NULL,NULL,'50000',NULL,NULL),(30,61,'Weekly','Hourly Rate',NULL,313,5,8,52,1,NULL,NULL,'5000',NULL,NULL),(31,62,'Semi-Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'5000',NULL,NULL),(32,63,'Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'2000',NULL,NULL),(33,64,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,100.00,'10000',NULL,NULL),(34,65,'Monthly','Monthly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'10000',NULL,NULL),(37,68,'Semi-Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'12312414',NULL,NULL),(38,69,'Semi-Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'12312421',NULL,NULL),(39,70,'Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'10000',NULL,NULL),(40,71,'Semi-Monthly','Daily Rate',NULL,313,NULL,8,52,0,313,NULL,'1000',NULL,NULL),(42,73,'Monthly','Hourly Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'1000',NULL,NULL),(43,74,'Weekly','Monthly Rate','STANDARD OT RATE',313,5,8,52,0,313,421.00,'100000',NULL,NULL),(44,75,'Monthly','Daily Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'10000',NULL,NULL),(45,79,'Weekly','Hourly Rate','STANDARD OT RATE',1231,21313,12313,123,0,123123,123123.00,'12321421',NULL,NULL),(47,81,'Monthly','Daily Rate',NULL,123,NULL,456,789,1,NULL,NULL,'10000',NULL,NULL),(49,83,'Weekly','Hourly Rate','STANDARD OT RATE',313,5,8,52,0,313,250.00,'5000',NULL,NULL),(50,84,'Weekly','Weekly Rate','STANDARD OT RATE',313,5,8,52,0,313,250.00,'5000',NULL,NULL),(52,86,'Monthly','Daily Rate','STANDARD OT RATE',313,NULL,8,52,0,313,NULL,'10000',NULL,NULL),(54,88,'Monthly','Monthly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'10000',NULL,NULL),(55,89,'Monthly','Monthly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'10000',NULL,NULL),(56,16,'Semi-Monthly','Monthly Rate','STANDARD OT RATE',312,NULL,8,52,0,313,500.00,'17000',NULL,NULL),(58,91,'Weekly','Daily Rate',NULL,313,5,8,52,1,NULL,NULL,'5000',NULL,NULL),(60,93,'Monthly','Daily Rate',NULL,313,NULL,8,52,1,NULL,NULL,'10000',NULL,NULL),(61,94,'Monthly','Daily Rate',NULL,313,NULL,8,52,1,NULL,NULL,'50000',NULL,NULL),(62,96,'Monthly','Hourly Rate',NULL,313,NULL,8,52,1,NULL,NULL,'1000000',NULL,NULL),(63,97,'Monthly','Daily Rate',NULL,313,NULL,8,52,1,NULL,NULL,'12002103',NULL,NULL),(64,98,'Monthly','Daily Rate',NULL,313,NULL,8,52,1,NULL,NULL,'12000',NULL,NULL),(66,100,'Monthly','Daily Rate',NULL,313,NULL,8,52,1,NULL,NULL,'1124',NULL,NULL);
/*!40000 ALTER TABLE `employee_payroll_settings` ENABLE KEYS */;
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

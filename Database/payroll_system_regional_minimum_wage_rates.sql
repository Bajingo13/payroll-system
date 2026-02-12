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
-- Dumping data for table `regional_minimum_wage_rates`
--

LOCK TABLES `regional_minimum_wage_rates` WRITE;
/*!40000 ALTER TABLE `regional_minimum_wage_rates` DISABLE KEYS */;
INSERT INTO `regional_minimum_wage_rates` VALUES (1,'NCR','National Capital Region',456.00,'2025-12-10 06:27:06'),(2,'CAR','Cordillera Administrative Region',280.00,'2025-12-10 06:27:54'),(4,'Region I','Ilocos Region',253.00,'2025-12-10 06:55:51'),(5,'Region II','Cagayan Valley',252.00,'2025-12-10 06:56:41'),(6,'Region III','Central Luzon',336.00,'2025-12-10 06:57:16'),(7,'Region IV‑A','CALABARZON',349.50,'2025-12-10 06:57:50'),(8,'Region IV‑B','MIMAROPA',264.00,'2025-12-10 06:58:26'),(9,'Region V','Bicol Region',252.00,'2025-12-10 06:59:15'),(10,'Region VI','Western Visayas',277.00,'2025-12-10 06:59:55'),(11,'Region VII','Central Visayas',327.00,'2025-12-10 07:00:21'),(12,'Region VIII','Eastern Visayas',253.00,'2025-12-10 07:00:52'),(13,'Region IX','Zamboanga Peninsula',267.00,'2025-12-10 07:01:26'),(14,'Region X','Northern Mindanao',286.00,'2025-12-10 07:01:45'),(15,'Region XI','Davao Region',291.00,'2025-12-10 07:02:09'),(16,'Region XII','SOCCSKSARGEN',260.00,'2025-12-10 07:02:30'),(17,'Region XIII','Caraga',258.00,'2025-12-10 07:03:08'),(18,'BARMM','Bangsamoro Autonomous Region in Muslim Mindanao',210.00,'2025-12-10 07:03:44');
/*!40000 ALTER TABLE `regional_minimum_wage_rates` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:02

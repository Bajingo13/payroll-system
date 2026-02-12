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
-- Dumping data for table `payroll_runs`
--

LOCK TABLES `payroll_runs` WRITE;
/*!40000 ALTER TABLE `payroll_runs` DISABLE KEYS */;
INSERT INTO `payroll_runs` VALUES (1,'semi-monthly','first half','1','2026','January 1–15, 2026','Generated','2026-02-10 02:55:00',NULL),(2,'semi-monthly','second half','1','2026','January 16–30, 2026','Pending','2026-02-10 04:39:23',NULL),(3,'semi-monthly','first half','2','2026','February 1–15, 2026','Pending','2026-02-10 04:39:36',NULL),(4,'weekly','2nd week','2','2026','February (2nd Week) 2026','Pending','2026-02-10 04:39:56',NULL);
/*!40000 ALTER TABLE `payroll_runs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:05

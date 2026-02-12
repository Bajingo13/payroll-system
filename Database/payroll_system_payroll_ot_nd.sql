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
-- Dumping data for table `payroll_ot_nd`
--

LOCK TABLES `payroll_ot_nd` WRITE;
/*!40000 ALTER TABLE `payroll_ot_nd` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll_ot_nd` ENABLE KEYS */;
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

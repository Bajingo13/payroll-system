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
-- Dumping data for table `system_lists`
--

LOCK TABLES `system_lists` WRITE;
/*!40000 ALTER TABLE `system_lists` DISABLE KEYS */;
INSERT INTO `system_lists` VALUES (1,'gender','Male',1),(2,'gender','Female',1),(4,'civil_status','Single',1),(5,'civil_status','Married',1),(6,'civil_status','Widowed',1),(7,'employee_type','Regular',1),(8,'employee_type','Probationary',1),(9,'employee_type','Contractual',1),(15,'position','Clerk',1),(16,'position','Manager',1),(17,'class','Office',1),(18,'class','Field',1),(19,'status','Active',1),(20,'status','End of Contract',1),(21,'status','Resigned',1),(22,'status','Terminated',1),(25,'civil_status','Other',1),(26,'civil_status','Separated',1),(27,'department','ADMIN',1),(28,'department','AIR INDIA',1),(29,'department','GULF AIR',1),(30,'department','VN AIRLINES',1),(31,'salary_type','ADMIN',1),(32,'salary_type','APPRENTICE',1),(33,'salary_type','DIRECT LABOR',1),(34,'salary_type','INDIRECT LABOR',1),(35,'company','Business Set Up & Compliance Inc.',1),(36,'company','AIRESOURCES INC.',1),(37,'company','AIRSALES INC.',1),(38,'location','Makati',1),(39,'location','Taguig',1),(40,'branch','Main Branch',1),(45,'branch','WCP',1),(46,'division','Finance',1),(47,'division','HR',1),(48,'division','IT',1),(49,'bank','BDO',1),(50,'bank','BPI',1),(51,'bank','Metrobank',1),(56,'projects','Internal Payroll System',1),(57,'projects','Client A',1),(58,'projects','Client B',1),(59,'bank_branch','Main Branch',1),(60,'bank_branch','Satellite Office',1),(61,'bank_branch','Davao',1),(62,'bank_branch','HO',1),(63,'bank_branch','Intramuros',1),(64,'bank_branch','WCP',1),(65,'bank_branch','5F Shangri-la Plaza',1),(66,'bank_branch','Arnaiz Ave Makati City',1),(67,'bank_branch','Ayala Ave. Makati City',1),(68,'bank_branch','BPI Ayala Triangle',1),(74,'branch','DAVAO',1),(75,'branch','HO',1),(76,'branch','Intramuros',1),(77,'payroll_period','Weekly',1),(78,'payroll_period','Semi-Monthly',1),(79,'payroll_period','Monthly',1),(80,'payroll_rate','Piece Rate',1),(81,'payroll_rate','Hourly Rate',1),(82,'payroll_rate','Daily Rate',1),(83,'payroll_rate','Weekly Rate',1),(84,'payroll_rate','Monthly Rate',1),(86,'ot_rate','STANDARD OT RATE',1);
/*!40000 ALTER TABLE `system_lists` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-12 15:27:06

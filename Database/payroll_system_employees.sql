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
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `employee_id` int NOT NULL AUTO_INCREMENT,
  `emp_code` varchar(20) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `gender` enum('Male','Female','Other') DEFAULT NULL,
  `civil_status` varchar(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `street` varchar(150) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `zip_code` varchar(20) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Active',
  `date_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `emp_code` (`emp_code`)
) ENGINE=InnoDB AUTO_INCREMENT=111 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employees`
--

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
INSERT INTO `employees` VALUES (11,'EMP-005','Arenas','Jastine Rhenie','','','Male','','2025-10-21','','','','','Active','2025-10-20 06:31:34'),(12,'EMP-006','Gonzales','Jordan',NULL,NULL,'Male','Separated','2025-10-21',NULL,NULL,NULL,NULL,'Active','2025-10-20 08:57:26'),(16,'EMP-001','Arenas','Jastine Rhenie','Ruiz','Arine','Male','Single','2021-10-21','Numancia Res., Urbiztondo St., San Nicolas','Manila','Philippines','1010','Active','2025-10-24 06:09:35'),(17,'EMP-003','Arenas','Jastine Rhenie',NULL,NULL,'Male',NULL,'2025-10-08',NULL,NULL,NULL,NULL,'Active','2025-10-24 06:16:09'),(18,'EMP-010','Enira','Arine',NULL,NULL,'Male',NULL,'2025-10-28',NULL,NULL,NULL,NULL,'Active','2025-10-28 06:46:14'),(19,'EMP-004','ENIRA','ARINE','','','Male','','2025-10-01','','','','','Active','2025-10-28 06:51:17'),(20,'EMP-007','Gonzales','Jordan','','','Male','','2025-10-16','','','','','Active','2025-10-28 07:30:39'),(28,'EMP-011','Aarea','asfm',NULL,NULL,'Female',NULL,'2025-10-07',NULL,NULL,NULL,NULL,'Resigned','2025-10-28 09:02:42'),(29,'EMP-012','Arenas','Jastine Rhenie','Ruiz','Arine','Male','Single','2001-10-21','Numancia Res., Urbiztondo St., San Nicolas','Manila','Philippines','1010','Active','2025-10-29 02:24:30'),(31,'EMP-013','sample','sample','sample','sample','Male','Other','2025-10-02','sample','sample','sample','1010','Active','2025-10-29 03:40:02'),(32,'EMP-014','sample','sample','','','Male','Single','2025-10-08','','','','1010','End of Contract','2025-10-29 03:42:23'),(33,'EMP-015','Asdnin','Brnien','sample','sample','Male','Separated','2025-10-08','sample','sample','sample','1010','Active','2025-10-29 03:44:53'),(34,'EMP-016','asdmas','zvs','','','Female','','2025-10-07','','','','','End of Contract','2025-10-29 04:32:18'),(35,'EMP-017','sample','sample','','','Female','','2025-10-24','','','','','End of Contract','2025-10-29 04:35:11'),(36,'EMP-018','sample','sample',NULL,NULL,'Male',NULL,'2025-10-03',NULL,NULL,NULL,NULL,'Active','2025-10-29 04:40:31'),(37,'EMP-019','sample','sample','','','Female','','2025-10-24','','','','','Active','2025-10-29 04:44:10'),(38,'EMP-020','sample','sample','','','Female','Other','2025-10-24','','','','','End of Contract','2025-10-29 04:46:57'),(39,'EMP-021','smaple','smaple','','','Male','','2025-10-16','','','','','Active','2025-10-29 04:52:23'),(41,'EMP-022','Enira','Arine','AE.','Arine','Female','Single','2025-10-01','Sample St.','Sample City','Sample','1010','Active','2025-10-29 05:02:09'),(42,'EMP-023','sample','sample',NULL,NULL,'Male',NULL,'2025-10-02',NULL,NULL,NULL,NULL,'Active','2025-10-29 05:10:56'),(43,'EMP-026','sample','sample','','','Male','Widowed','2025-10-31','','','','','Terminated','2025-10-29 05:15:16'),(44,'EMP-027','sample','sample',NULL,NULL,'Male',NULL,'2025-10-23',NULL,NULL,NULL,NULL,'Active','2025-10-29 05:30:51'),(45,'EMP-028','sample','sample',NULL,NULL,'Female',NULL,'2025-10-02',NULL,NULL,NULL,NULL,'Active','2025-10-29 05:40:41'),(46,'EMP-030','sample','sample',NULL,NULL,'Female',NULL,'2025-10-02',NULL,NULL,NULL,NULL,'Active','2025-10-29 05:57:30'),(47,'EMP-029','sample','sample',NULL,NULL,'Female',NULL,'2025-10-08',NULL,NULL,NULL,NULL,'Active','2025-10-29 06:01:58'),(48,'EMP-031','sample','sample',NULL,NULL,'Female',NULL,'2025-10-09',NULL,NULL,NULL,NULL,'Active','2025-10-29 06:09:14'),(49,'EMP-032','sample','sample','','','Male','Separated','2025-10-23','','','','','End of Contract','2025-10-29 06:11:22'),(50,'EMP-033','sample','sample','','','Female','','2025-10-09','','','','','End of Contract','2025-10-29 06:16:05'),(51,'EMP-034','sample','sample',NULL,NULL,'Male',NULL,'2025-10-09',NULL,NULL,NULL,NULL,'Active','2025-10-29 06:27:25'),(52,'EMP-035','sample','sample','sample','sample','Female','Married','2025-10-16','sample','sample','sample','123213','Active','2025-10-29 06:48:05'),(53,'EMP-036','samplesample','samplesample','samplesample','samplesample','Male','Separated','2025-10-01','samplesample','samplesample','samplesample','1234','Active','2025-10-29 06:49:51'),(54,'EMP-024','sample','sample','','','Female','Separated','2025-10-29','','','','','Active','2025-10-29 06:57:46'),(55,'EMP-025','Gonzales','Jordan','M.','Dan','Male','Married','2025-11-05','Street','City','Country','1234','Active','2025-11-04 01:27:28'),(61,'EMP-037','Enira','Arine',NULL,NULL,'Female',NULL,'2025-11-27',NULL,NULL,NULL,NULL,'Active','2025-11-04 06:45:49'),(62,'EMP-038','sample','sample',NULL,NULL,'Female',NULL,'2025-11-12',NULL,NULL,NULL,NULL,'Active','2025-11-04 06:47:08'),(63,'EMP-039','sample','sample',NULL,NULL,'Female',NULL,'2025-11-01',NULL,NULL,NULL,NULL,'End of Contract','2025-11-04 07:02:23'),(64,'EMP-002','Arenas','Jastine Rhenie','Ruiz','Arine','Male',NULL,'2025-11-01',NULL,NULL,NULL,NULL,'Active','2025-11-05 05:11:54'),(65,'EMP-008','Arenas','Jastine Rhenie','','','Male','','2025-10-28','','','','','Active','2025-11-10 03:17:26'),(68,'EMP-009','sample','sample','sample',NULL,'Female','Separated','2025-11-12',NULL,NULL,NULL,NULL,'Active','2025-11-10 03:48:35'),(69,'EMP-040','THIS IS SAMPLE HOLD','THIS IS SAMPLE HOLD',NULL,NULL,'Male',NULL,'2025-11-12',NULL,NULL,NULL,NULL,'Active','2025-11-10 08:11:45'),(70,'EMP-041','sample','sample','sample','sample','Female','Other','2025-11-20','sample','sample','sample','1234','Active','2025-11-11 03:26:42'),(71,'EMP-042','Arenas','Jastine','','','Female','','2025-11-06','','','','','Active','2025-11-11 07:32:34'),(73,'EMP-043','sample','sample','','','Female','','2025-10-30','','','','','Active','2025-11-12 02:15:08'),(74,'EMP-044','sample','sample','sample','sample','Female','Married','2025-11-06','sample','sample','sample','1010','End of Contract','2025-11-12 07:21:52'),(75,'EMP-045','sample','sample','','','Female','','2025-10-31','','','Philippines','','Active','2025-11-13 05:48:09'),(79,'EMP-046','sample','sample','sample','sample','Female','Married','2025-11-06','sample','sample','Philippines','101010','Active','2025-11-13 07:38:20'),(81,'EMP-047','sample','sample','sample','sample','Female','Married','2025-11-06','sample','sample','Philippines','1010','Active','2025-11-17 05:48:06'),(83,'EMP-048','Arenas','Jastine','sample',NULL,'Male','Married','2025-11-16','sample','sample','Philippines','1010','End of Contract','2025-11-17 08:19:10'),(84,'EMP-049','Enira','Arine','sample','sample','Male','Widowed','2025-11-16','sample','sample','hatdog','1010','Terminated','2025-11-17 08:29:51'),(86,'EMP-050','sample','sample',NULL,NULL,'Female',NULL,'2025-11-19',NULL,NULL,'Philippines',NULL,'Active','2025-11-18 07:18:06'),(88,'EMP-051','sample','sample',NULL,NULL,'Male',NULL,'2025-11-11',NULL,NULL,'Philippines',NULL,'Active','2025-11-25 02:20:36'),(89,'EMP-000','sample','sample',NULL,NULL,'Male',NULL,'2025-11-06',NULL,NULL,'Philippines',NULL,'Active','2025-11-25 02:31:39'),(91,'EMP-0','sample','sample','sample','sample','Female','Married','2025-11-01','sample','sample','Philippines','1010','Active','2025-11-27 06:51:54'),(93,'EMP-00','sample','sample',NULL,NULL,'Female',NULL,'2025-12-05',NULL,NULL,'Philippines',NULL,'Active','2025-12-01 03:01:58'),(94,'EMP-0000','Arine','Enira','','','Male','','2012-12-12','','','Philippines','','Active','2025-12-09 08:18:53'),(96,'000','sample','sample',NULL,NULL,'Male',NULL,'2025-12-08',NULL,NULL,'Philippines',NULL,'Active','2025-12-10 07:10:02'),(97,'001','sample','sample',NULL,NULL,'Male',NULL,'2025-12-04',NULL,NULL,'Philippines',NULL,'End of Contract','2025-12-10 07:14:45'),(98,'002','sample','sample','','','Female','','2122-02-11','','','Philippines','','Active','2025-12-10 07:35:50'),(100,'003','sample','sample',NULL,NULL,'Female',NULL,'2025-12-02',NULL,NULL,'Philippines',NULL,'Active','2025-12-10 08:00:06');
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
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

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
-- Table structure for table `employee_dependents`
--

DROP TABLE IF EXISTS `employee_dependents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_dependents` (
  `dependent_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  PRIMARY KEY (`dependent_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_dependents_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=686 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_dependents`
--

LOCK TABLES `employee_dependents` WRITE;
/*!40000 ALTER TABLE `employee_dependents` DISABLE KEYS */;
INSERT INTO `employee_dependents` VALUES (5,33,'sample','2025-09-29'),(6,33,'sample','2025-10-29'),(7,33,'sample','2025-10-22'),(8,33,'sample','2025-10-09'),(17,52,'sample','2025-09-30'),(18,52,'sample','2025-11-04'),(19,52,'sample','2025-10-29'),(20,52,'sample','2025-10-01'),(47,55,'sample 1','2025-11-04'),(48,55,'sample 2','2025-11-22'),(49,55,'sample 3','2025-11-07'),(50,55,'sample 4','2025-11-14'),(275,53,'samplesample','2025-11-19'),(276,53,'samplesample','2025-11-19'),(277,53,'samplesample','2025-11-19'),(278,53,'samplesample','2025-11-19'),(321,70,'sample','2025-11-18'),(322,70,'sample','2025-11-06'),(323,70,'sample','2025-10-30'),(324,70,'sample','2025-11-14'),(331,74,'sample','2025-11-11'),(332,74,'sample','2025-11-18'),(333,74,'sample','2025-11-26'),(334,74,'sample','2025-10-28'),(347,79,'sample','2025-11-23'),(348,79,'sample','2025-10-28'),(349,79,'sample','2025-11-26'),(350,79,'sample','2025-11-04'),(351,81,'sample','2025-11-19'),(352,81,'sample','2025-10-30'),(353,81,'sample','2025-11-12'),(354,81,'sample','2025-11-07'),(371,83,'sample','2025-11-16'),(372,83,'sample','2025-11-16'),(373,83,'sample','2025-11-16'),(374,83,'sample','2025-11-16'),(417,84,'sample','2025-11-16'),(418,84,'sample','2025-11-16'),(419,84,'sample','2025-11-16'),(420,84,'sample','2025-11-16'),(431,89,'sample','2025-11-25'),(432,89,'sample','2025-11-25'),(433,89,'sample','2025-11-25'),(434,89,'sample','2025-11-25'),(591,91,'sample','2025-11-18'),(592,91,'sample','2025-11-18'),(593,91,'sample','2025-11-18'),(594,91,'sample','2025-11-21'),(642,42,'sample','2025-10-01'),(643,42,'sample','2025-10-29'),(644,42,'sample','2025-10-23'),(645,42,'sample','2025-10-23'),(674,41,'N/A','2025-10-30'),(675,41,'N/A','2025-10-15'),(676,41,'N/A','2025-10-09'),(677,41,'N/A','2025-10-01'),(682,16,'Ayeshia R. Arenas','2025-10-08'),(683,16,'Ayeshia R. Arenas','2025-10-08'),(684,16,'Zhummer R. Arenas','2017-03-15'),(685,16,'Zhummer R. Arenas','2017-03-15');
/*!40000 ALTER TABLE `employee_dependents` ENABLE KEYS */;
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

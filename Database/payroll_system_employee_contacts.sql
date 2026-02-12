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
-- Table structure for table `employee_contacts`
--

DROP TABLE IF EXISTS `employee_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_contacts` (
  `contact_id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `tel_no` varchar(50) DEFAULT NULL,
  `mobile_no` varchar(50) DEFAULT NULL,
  `fax_no` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `website` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`contact_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_contacts_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_contacts`
--

LOCK TABLES `employee_contacts` WRITE;
/*!40000 ALTER TABLE `employee_contacts` DISABLE KEYS */;
INSERT INTO `employee_contacts` VALUES (6,11,'','','','jastine@example.com',''),(7,12,NULL,NULL,NULL,'gonzales@example.com',NULL),(11,16,'123-4567-890','09928041063','N/A','jastinearenas2101@gmail.com','http://jastinearenas.com.ph'),(12,17,NULL,NULL,NULL,'jastine@example.com',NULL),(13,18,NULL,NULL,NULL,'arine@yahoo.com',NULL),(14,19,'','','','arine@ssamel.com',''),(15,20,'','','','jordan@sample.com',''),(23,28,NULL,NULL,NULL,'dfsadf',NULL),(24,29,NULL,NULL,NULL,'jastinearenas2101@gmail.com','http://jastinearenas.com.ph'),(26,31,NULL,NULL,NULL,'sample','sample'),(27,32,'','','','sample',''),(28,33,'sample','sample','sample','sample','sample'),(29,34,'','','','asdmas',''),(30,35,'','','','sample',''),(31,36,NULL,NULL,NULL,'sample@email.com',NULL),(32,37,'','','','sample',''),(33,38,'','','','sample',''),(34,39,'','','','smaple',''),(36,41,'123-456-78','091234567890','N/A','arine@enira.com','http://arine.com.ph'),(37,42,NULL,NULL,NULL,'sample@email.com',NULL),(38,43,'','','','sample',''),(39,44,NULL,NULL,NULL,'sample@email.com',NULL),(40,45,NULL,NULL,NULL,'sample@email.com',NULL),(41,46,NULL,NULL,NULL,'sample@email.com',NULL),(42,47,NULL,NULL,NULL,'sample@email.com',NULL),(43,48,NULL,NULL,NULL,'sample@email.com',NULL),(44,49,'','','','sample',''),(45,50,'','','','sample',''),(46,51,NULL,NULL,NULL,'sample@email.com',NULL),(47,52,'sample','sample','sample','sample','sample'),(48,53,'samplesample','samplesample','samplesample','samplesample','samplesample'),(49,54,'','','','sample',''),(50,55,'12345678910','123-4567-89','123','gonzales@sample.com','http://jordangonzales.com.ph'),(56,61,NULL,NULL,NULL,'arineaonosan',NULL),(57,62,NULL,NULL,NULL,'sample',NULL),(58,63,NULL,NULL,NULL,'sample',NULL),(59,64,NULL,NULL,NULL,'jastine@yahoo.com',NULL),(60,65,'','','','jastinearenas2101@gmail.com',''),(63,68,NULL,NULL,NULL,'sample',NULL),(64,69,NULL,NULL,NULL,'thisaendf@email.com',NULL),(65,70,'sample','sample','sample','sample','sample'),(66,71,'','','','sample',''),(68,73,'','','','sample',''),(69,74,'sample','sample','sample','sample','sample'),(70,75,'','','','sample',''),(74,79,'12313','2131431','124124','sample','sample'),(76,81,'sample','sample','sample','sample','sample'),(78,83,'sample','sample','sample','email','sample'),(79,84,'sample','sample','sample','hatdog','sample'),(81,86,NULL,NULL,NULL,'sample',NULL),(83,88,NULL,NULL,NULL,'sample',NULL),(84,89,NULL,NULL,NULL,'sample',NULL),(86,91,'sample','sample','sample','sample@email.com','https://sample.com'),(88,93,NULL,NULL,NULL,'sample@gmail.com','https://sample.com'),(89,94,'','','','arine@sample.com',''),(90,96,NULL,NULL,NULL,'sample@gmail.com',NULL),(91,97,NULL,NULL,NULL,'sample@gmail.com',NULL),(92,98,'','','','sample@gmail.com',''),(94,100,NULL,NULL,NULL,'sample@gmail.com',NULL);
/*!40000 ALTER TABLE `employee_contacts` ENABLE KEYS */;
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

# RDS. MVP 문서 7.5 네트워크(서브넷)·7.7(스케일링) 절 기준. Single-AZ.

resource "aws_db_subnet_group" "main" {
  name       = "qring-db-subnet-group"
  subnet_ids = [aws_subnet.db_a.id, aws_subnet.db_c.id]

  tags = {
    Name = "qring-db-subnet-group"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "qring-db"
  engine         = "postgres"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_encrypted = true

  db_name                     = "qring"
  username                    = var.db_master_username
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  skip_final_snapshot = true
  deletion_protection = false

  tags = {
    Name = "qring-db"
  }
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "rds_master_user_secret_arn" {
  description = "암호가 담긴 secret arn"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

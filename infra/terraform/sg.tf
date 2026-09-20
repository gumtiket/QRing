resource "aws_security_group" "alb" {
  name        = "qring-sg-alb"
  description = "ALB: allow HTTP/HTTPS from the internet"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "qring-sg-alb"
  }
}

resource "aws_security_group" "web" {
  name        = "qring-sg-web"
  description = "web/API server"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "qring-sg-web"
  }
}

resource "aws_security_group" "worker" {
  name        = "qring-sg-worker"
  description = "dispatch worker"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "qring-sg-worker"
  }
}

resource "aws_security_group" "rds" {
  name        = "qring-sg-rds"
  description = "RDS"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "qring-sg-rds"
  }
}

# --- sg-alb: 443/80 ← 전체, 8080 → sg-web ---

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
}

# --- sg-web: 8080 ← sg-alb, 5432 → sg-rds, 443 → 전체 ---

resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "web_to_rds" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.rds.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "web_https_out" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# --- sg-worker: 인바운드 없음, 5432 → sg-rds, 443 → 전체 ---

resource "aws_vpc_security_group_egress_rule" "worker_to_rds" {
  security_group_id            = aws_security_group.worker.id
  referenced_security_group_id = aws_security_group.rds.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "worker_https_out" {
  security_group_id = aws_security_group.worker.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# --- sg-rds: 5432 ← sg-web, sg-worker. 아웃바운드 없음 ---

resource "aws_vpc_security_group_ingress_rule" "rds_from_web" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.web.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_worker" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.worker.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

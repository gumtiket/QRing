# EC2가 부팅할 때 쓸 틀(AMI + 인스턴스 타입 + 역할 + user-data). ASG는 다음 단계.

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

locals {
  # ACM/도메인 붙이기 전까지는 ALB DNS 이름을 그대로 BASE_URL로 쓴다.
  base_url = "http://${aws_lb.web.dns_name}"
}

resource "aws_launch_template" "web" {
  name          = "qring-lt-web"
  image_id      = data.aws_ami.al2023.id
  instance_type = "t3.micro"

  iam_instance_profile {
    name = aws_iam_instance_profile.web.name
  }

  vpc_security_group_ids = [aws_security_group.web.id]

  user_data = base64encode(templatefile("${path.module}/../templates/user-data.sh.tftpl", {
    deploy_bucket     = aws_s3_bucket.deploy_artifacts.bucket
    aws_region        = var.aws_region
    rds_secret_arn    = aws_db_instance.main.master_user_secret[0].secret_arn
    db_host           = aws_db_instance.main.address
    db_port           = aws_db_instance.main.port
    db_name           = aws_db_instance.main.db_name
    db_username       = var.db_master_username
    webpush_queue_arn = aws_sqs_queue.webpush_dispatch.arn
    webpush_queue_url = aws_sqs_queue.webpush_dispatch.url
    port              = 8080
    base_url          = local.base_url
    role              = "web"
    entry_point       = "dist/index.js"
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "qring-web"
    }
  }
}

resource "aws_launch_template" "worker" {
  name          = "qring-lt-worker"
  image_id      = data.aws_ami.al2023.id
  instance_type = "t3.micro"

  iam_instance_profile {
    name = aws_iam_instance_profile.worker.name
  }

  vpc_security_group_ids = [aws_security_group.worker.id]

  user_data = base64encode(templatefile("${path.module}/../templates/user-data.sh.tftpl", {
    deploy_bucket     = aws_s3_bucket.deploy_artifacts.bucket
    aws_region        = var.aws_region
    rds_secret_arn    = aws_db_instance.main.master_user_secret[0].secret_arn
    db_host           = aws_db_instance.main.address
    db_port           = aws_db_instance.main.port
    db_name           = aws_db_instance.main.db_name
    db_username       = var.db_master_username
    webpush_queue_arn = aws_sqs_queue.webpush_dispatch.arn
    webpush_queue_url = aws_sqs_queue.webpush_dispatch.url
    port              = 8080
    base_url          = local.base_url
    role              = "worker"
    entry_point       = "dist/worker/index.js"
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "qring-worker"
    }
  }
}

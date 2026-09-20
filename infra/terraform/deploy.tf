# 배포 아티팩트(빌드된 앱 코드 zip)를 담아두는 버킷.

resource "aws_s3_bucket" "deploy_artifacts" {
  bucket = "qring-deploy-artifacts-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "qring-deploy-artifacts"
  }
}

resource "aws_s3_bucket_versioning" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "deploy_artifacts_bucket_name" {
  value = aws_s3_bucket.deploy_artifacts.bucket
}

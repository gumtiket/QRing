terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # 값을 비워두고 backend.hcl에서 참조
  }
}


provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
}
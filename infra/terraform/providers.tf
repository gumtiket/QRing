terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_profile" {
  description = "로컬 AWS 프로필 이름 (aws sso login으로 인증된 프로필)"
  type        = string
  default     = "qrtf"
}

variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
}

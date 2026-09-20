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

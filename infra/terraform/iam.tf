data "aws_iam_policy_document" "role_boundary" {
  statement {
    sid    = "Sns"
    effect = "Allow"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:Publish",
      "sns:Subscribe",
    ]
    resources = ["arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:qring-ch-*"]
  }

  statement {
    sid    = "Sqs"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.webpush_dispatch.arn]
  }

  # VAPID 키 등 앱 설정값. /qring/* 로만 좁힌다.
  statement {
    sid    = "SsmParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/qring/*"]
  }

  # RDS 마스터 암호(Secrets Manager 관리형).
  statement {
    sid    = "SecretsManager"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [aws_db_instance.main.master_user_secret[0].secret_arn]
  }

  # 부팅할 때 배포 아티팩트를 받아가는 용도.
  statement {
    sid    = "DeployArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.deploy_artifacts.arn,
      "${aws_s3_bucket.deploy_artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "SsmSessionManager"
    effect = "Allow"
    actions = [
      "ssm:DescribeAssociation",
      "ssm:GetDeployablePatchSnapshotForInstance",
      "ssm:GetDocument",
      "ssm:DescribeDocument",
      "ssm:GetManifest",
      "ssm:ListAssociations",
      "ssm:ListInstanceAssociations",
      "ssm:PutInventory",
      "ssm:PutComplianceItems",
      "ssm:PutConfigurePackageResult",
      "ssm:UpdateAssociationStatus",
      "ssm:UpdateInstanceAssociationStatus",
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "role_boundary" {
  name        = "qring-role-boundary"
  description = "Permissions boundary for qring EC2 instance roles (role-web, role-worker)"
  policy      = data.aws_iam_policy_document.role_boundary.json
}

# EC2가 assume 하는 신뢰 정책. role-web/role-worker 공통.
data "aws_iam_policy_document" "ec2_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# --- role-web ---

resource "aws_iam_role" "web" {
  name                 = "qring-role-web"
  assume_role_policy   = data.aws_iam_policy_document.ec2_trust.json
  permissions_boundary = aws_iam_policy.role_boundary.arn
}

data "aws_iam_policy_document" "web_permissions" {
  statement {
    sid    = "Sns"
    effect = "Allow"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:Publish",
      "sns:Subscribe",
    ]
    resources = ["arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:qring-ch-*"]
  }

  statement {
    sid    = "SsmParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/qring/*"]
  }

  statement {
    sid       = "SecretsManager"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.main.master_user_secret[0].secret_arn]
  }

  statement {
    sid    = "DeployArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.deploy_artifacts.arn,
      "${aws_s3_bucket.deploy_artifacts.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "web" {
  name   = "qring-role-web-permissions"
  role   = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web_permissions.json
}

resource "aws_iam_role_policy_attachment" "web_ssm_core" {
  role       = aws_iam_role.web.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "web" {
  name = "qring-instance-profile-web"
  role = aws_iam_role.web.name
}

# --- role-worker ---

resource "aws_iam_role" "worker" {
  name                 = "qring-role-worker"
  assume_role_policy   = data.aws_iam_policy_document.ec2_trust.json
  permissions_boundary = aws_iam_policy.role_boundary.arn
}

data "aws_iam_policy_document" "worker_permissions" {
  statement {
    sid    = "Sqs"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.webpush_dispatch.arn]
  }

  statement {
    sid    = "SsmParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/qring/*"]
  }

  statement {
    sid       = "SecretsManager"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.main.master_user_secret[0].secret_arn]
  }

  statement {
    sid    = "DeployArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.deploy_artifacts.arn,
      "${aws_s3_bucket.deploy_artifacts.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "qring-role-worker-permissions"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker_permissions.json
}

resource "aws_iam_role_policy_attachment" "worker_ssm_core" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "worker" {
  name = "qring-instance-profile-worker"
  role = aws_iam_role.worker.name
}

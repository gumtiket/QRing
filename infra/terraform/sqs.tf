resource "aws_sqs_queue" "webpush_dispatch_dlq" {
  name                      = "qring-webpush-dispatch-dlq"
  message_retention_seconds = 60 * 60 * 24 * 14 # 14일
}

resource "aws_sqs_queue" "webpush_dispatch" {
  name                       = "qring-webpush-dispatch"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 60 * 60 * 24 # 1일
  receive_wait_time_seconds  = 20 # 롱 폴링

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webpush_dispatch_dlq.arn
    maxReceiveCount      = 5
  })
}

# qring-ch- 으로 시작하는 sns 토픽을 허용
data "aws_iam_policy_document" "webpush_dispatch_queue_policy" {
  statement {
    sid    = "AllowChannelTopicsToSendMessage"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.webpush_dispatch.arn]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:qring-ch-*"]
    }
  }
}

resource "aws_sqs_queue_policy" "webpush_dispatch" {
  queue_url = aws_sqs_queue.webpush_dispatch.id
  policy    = data.aws_iam_policy_document.webpush_dispatch_queue_policy.json
}

output "webpush_dispatch_queue_url" {
  value = aws_sqs_queue.webpush_dispatch.url
}

output "webpush_dispatch_queue_arn" {
  value = aws_sqs_queue.webpush_dispatch.arn
}

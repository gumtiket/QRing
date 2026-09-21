resource "aws_autoscaling_group" "web" {
  name             = "qring-asg-web"
  min_size         = 2
  max_size         = 6
  desired_capacity = 2

  vpc_zone_identifier = [aws_subnet.app_a.id, aws_subnet.app_c.id]

  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }

  target_group_arns = [aws_lb_target_group.web.arn]

  health_check_type         = "ELB"
  health_check_grace_period = 120

  tag {
    key                 = "Name"
    value               = "qring-web"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_group" "worker" {
  name             = "qring-asg-worker"
  min_size         = 1
  max_size         = 5
  desired_capacity = 1

  vpc_zone_identifier = [aws_subnet.app_a.id, aws_subnet.app_c.id]

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 120

  tag {
    key                 = "Name"
    value               = "qring-worker"
    propagate_at_launch = true
  }
}

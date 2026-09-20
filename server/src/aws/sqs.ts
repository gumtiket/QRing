import { SQSClient } from "@aws-sdk/client-sqs";
import { AWS_REGION } from "../config";

export const sqsClient = new SQSClient({ region: AWS_REGION });

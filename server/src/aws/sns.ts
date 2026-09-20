import { SNSClient } from "@aws-sdk/client-sns";
import { AWS_REGION } from "../config";

// SDK가 자동으로 권한을 찾는다.
export const snsClient = new SNSClient({ region: AWS_REGION });
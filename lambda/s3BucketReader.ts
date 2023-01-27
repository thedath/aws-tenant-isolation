import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import constants from "./constants";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  const s3BucketName = constants.S3_BUCKET_NAME;

  if (!process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_2]) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Access role not found",
      }),
    };
  }
  const assumedRoleARN = process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_2];

  const tenantId = event.queryStringParameters?.["tenantId"];
  if (!tenantId) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Tenant ID is required",
      }),
    };
  }

  const sts = new STSClient({});
  const session = await sts.send(
    new AssumeRoleCommand({
      RoleArn: assumedRoleARN,
      RoleSessionName: "S3BucketReaderSession",
      DurationSeconds: 900,
      Tags: [
        {
          Key: constants.SESSION_TAG_KEY,
          Value: constants.SESSION_TAG_PRE_DEFINED_VALUE,
        },
      ],
    })
  );

  const s3Client = new S3Client({
    credentials: {
      accessKeyId: session.Credentials?.AccessKeyId!,
      secretAccessKey: session.Credentials?.SecretAccessKey!,
      sessionToken: session.Credentials?.SessionToken,
    },
  });

  try {
    const result = await s3Client.send(
      new ListObjectsCommand({
        Bucket: s3BucketName,
        Prefix: tenantId,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...result,
      }),
    };
  } catch (error) {
    console.log(error);

    return {
      statusCode: 403,
      body: JSON.stringify({ error }),
    };
  }
};

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import constants from "./constants";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  const s3BucketName = constants.S3_BUCKET_NAME;

  if (!process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_4]) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Access role not found",
      }),
    };
  }
  const assumedRoleARN = process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_4];
  console.log("assumedRoleARN: ", assumedRoleARN);

  const tenantId = event.queryStringParameters?.["tenantId"];
  if (!tenantId) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Tenant ID is required",
      }),
    };
  }

  const fileName = event.queryStringParameters?.["fileName"];
  if (!fileName) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "File name is required",
      }),
    };
  }

  const text = event.queryStringParameters?.["text"];
  if (!text) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Text is required",
      }),
    };
  }

  const sts = new STSClient({});
  const session = await sts.send(
    new AssumeRoleCommand({
      RoleArn: assumedRoleARN,
      RoleSessionName: "S3BucketWriterSession",
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
      new PutObjectCommand({
        Bucket: s3BucketName,
        Key: `${tenantId}/${fileName}`,
        Body: text,
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

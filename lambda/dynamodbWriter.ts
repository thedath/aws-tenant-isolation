import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import constants from "./constants";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  try {
    if (!process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_3]) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Access role not found",
        }),
      };
    }
    const assumedRoleARN = process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_3];

    const tenantId = event.queryStringParameters?.["tenantId"];
    if (!tenantId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Tenant ID is required",
        }),
      };
    }

    const email = event.queryStringParameters?.["email"];
    if (!email) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Email is required",
        }),
      };
    }

    const sts = new STSClient({});
    const session = await sts.send(
      new AssumeRoleCommand({
        RoleArn: assumedRoleARN,
        RoleSessionName: "TempSessionName",
        DurationSeconds: 900,
        Tags: [
          {
            Key: constants.SESSION_TAG_KEY,
            Value: constants.SESSION_TAG_PRE_DEFINED_VALUE,
          },
        ],
      })
    );

    const dynamoDb = new DynamoDBClient({
      credentials: {
        accessKeyId: session.Credentials?.AccessKeyId!,
        secretAccessKey: session.Credentials?.SecretAccessKey!,
        sessionToken: session.Credentials?.SessionToken,
      },
    });

    const tableName = constants.TABLE_NAME;

    const result = await dynamoDb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          [constants.TABLE_PARTITION_KEY]: { S: tenantId! },
          [constants.TABLE_SORT_KEY]: { S: email! },
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error }),
    };
  }
};

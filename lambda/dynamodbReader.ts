import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import getConstants from "./constants";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  const constants = getConstants();

  if (!process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_1]) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Access role not found",
      }),
    };
  }
  const assumedRoleARN = process.env[constants.ASSUMED_ROLE_ARN_ENV_KEY_1];

  const tenantId = event.queryStringParameters?.["tenantId"];
  if (!tenantId) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Tenant ID need to passed",
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

  try {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#TIDkey = :TIDvalue",
        ExpressionAttributeNames: {
          "#TIDkey": constants.TABLE_PARTITION_KEY,
        },
        ExpressionAttributeValues: {
          ":TIDvalue": {
            S: tenantId,
          },
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...result.Items,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error }),
    };
  }
};

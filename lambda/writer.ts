import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  try {
    const assumedRoleARN = process.env.TABLE_WRITE_ASSUMED_ROLE!;

    const { tenantId, email, ...rest } = event.queryStringParameters as {
      [key: string]: string;
    };

    if (!tenantId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Tenant ID is required",
        }),
      };
    }

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
        RoleSessionName: "TableWriterSession",
        DurationSeconds: 900,
        Tags: [
          {
            Key: "OrgPartK1",
            Value: "",
          },
          {
            Key: "OrgPartK2",
            Value: "",
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

    const items: { [key: string]: { S: string } } = {};
    Object.keys(rest).forEach((key) => {
      items[key] = { S: rest[key]! };
    });

    const result = await dynamoDb.send(
      new PutItemCommand({
        TableName: "OrgTable",
        Item: { ...items },
        ReturnValues: "",
      })
    );

    return { statusCode: 200, body: JSON.stringify({ ...result }) };
  } catch (error) {
    console.log(error);

    return { statusCode: 403, body: JSON.stringify({ error }) };
  }
};

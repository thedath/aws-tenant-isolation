import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  try {
    const assumedRoleARN = process.env.TABLE_READ_ASSUMED_ROLE!;

    const sts = new STSClient({});
    const session = await sts.send(
      new AssumeRoleCommand({
        RoleArn: assumedRoleARN,
        RoleSessionName: "TableReaderSession",
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

    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: "OrgTable",
        KeyConditionExpression: "#PK1 = :PK1V",
        ExpressionAttributeNames: {
          "#PK1": "OrgPartK1",
        },
        ExpressionAttributeValues: {
          ":PK1V": {
            S: "",
          },
        },
        ProjectionExpression: "",
      })
    );

    return { statusCode: 200, body: JSON.stringify({ ...result.Items }) };
  } catch (error) {
    console.log(error);

    return { statusCode: 403, body: JSON.stringify({ error }) };
  }
};

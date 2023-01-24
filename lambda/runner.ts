import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  if (!process.env.TABLE_NAME) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Table name not found",
      }),
    };
  }
  const tableName = process.env.TABLE_NAME;

  if (!process.env.TABLE_ARN) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Table name not found",
      }),
    };
  }
  const tableArn = process.env.TABLE_ARN;

  if (!process.env.ASSUMED_BY_ROLE_ARN) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Access role not found",
      }),
    };
  }
  const assumedByRoleARN = process.env.ASSUMED_BY_ROLE_ARN;

  if (!process.env.TEMP_SESSION_ROLE_ARN) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Access role not found",
      }),
    };
  }
  const tempSessionRoleARN = process.env.TEMP_SESSION_ROLE_ARN;

  const tenantId = event.queryStringParameters?.["tenantId"];
  if (!tenantId) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        message: "Tenant ID need to passed",
      }),
    };
  }

  // {
  //   "Effect": "Allow",
  //   "Principal": {
  //     "AWS": "${assumedByRoleARN}"
  //   },
  //   "Action": "sts:AssumeRole"
  // },

  // const policy = {
  //   Version: "2012-10-17",
  //   Statement: [
  //     {
  //       Effect: "Allow",
  //       Action: ["dynamodb:Query"],
  //       Resource: [tableArn],
  //       Condition: {
  //         "ForAllValues:StringLike": {
  //           "dynamodb:LeadingKeys": ["${aws:PrincipalTag/TenantID}"],
  //         },
  //       },
  //     },
  //   ],
  // };

  const sts = new STSClient({});
  const session = await sts.send(
    new AssumeRoleCommand({
      RoleArn: tempSessionRoleARN,
      RoleSessionName: "TempSessionName",
      DurationSeconds: 900,
      Tags: [
        {
          Key: "TenantID",
          Value: "alpha",
        },
      ],
      // Policy: JSON.stringify(policy),
    })
  );

  // Configure the AWS SDK
  const dynamoDb = new DynamoDBClient({
    credentials: {
      accessKeyId: session.Credentials?.AccessKeyId!,
      secretAccessKey: session.Credentials?.SecretAccessKey!,
      sessionToken: session.Credentials?.SessionToken,
    },
  });

  try {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#TIDkey = :TIDvalue",
        ExpressionAttributeNames: {
          "#TIDkey": "TenantID",
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

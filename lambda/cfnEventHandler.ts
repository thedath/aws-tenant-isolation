import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceHandler,
  Context,
} from "aws-lambda";
import getConstants from "./constants";

export const handler: CloudFormationCustomResourceHandler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<void> => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  const constants = getConstants();

  if (event.RequestType !== "Create") {
    console.log(
      constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
      "Event type: " + event.RequestType
    );
    return;
  }

  try {
    const dynamodbClient = new DynamoDBClient({});

    dynamodbClient.send(
      new PutItemCommand({
        TableName: constants.TABLE_NAME,
        Item: {
          [constants.TABLE_PARTITION_KEY]: { S: "alpha" },
          [constants.TABLE_SORT_KEY]: { S: "alpha1@alpha1.com" },
        },
      })
    );
    dynamodbClient.send(
      new PutItemCommand({
        TableName: constants.TABLE_NAME,
        Item: {
          [constants.TABLE_PARTITION_KEY]: { S: "alpha" },
          [constants.TABLE_SORT_KEY]: { S: "alpha2@alpha2.com" },
        },
      })
    );
    dynamodbClient.send(
      new PutItemCommand({
        TableName: constants.TABLE_NAME,
        Item: {
          [constants.TABLE_PARTITION_KEY]: { S: "beta" },
          [constants.TABLE_SORT_KEY]: { S: "beta1@beta1.com" },
        },
      })
    );
    dynamodbClient.send(
      new PutItemCommand({
        TableName: constants.TABLE_NAME,
        Item: {
          [constants.TABLE_PARTITION_KEY]: { S: "beta" },
          [constants.TABLE_SORT_KEY]: { S: "beta2@beta2.com" },
        },
      })
    );

    const s3Client = new S3Client({});

    s3Client.send(
      new PutObjectCommand({
        Bucket: constants.S3_BUCKET_NAME,
        Key: "alpha/fileName1.txt",
        Body: "Test content 1",
      })
    );
    s3Client.send(
      new PutObjectCommand({
        Bucket: constants.S3_BUCKET_NAME,
        Key: "alpha/fileName2.txt",
        Body: "Test content 2",
      })
    );
    s3Client.send(
      new PutObjectCommand({
        Bucket: constants.S3_BUCKET_NAME,
        Key: "beta/fileName3.txt",
        Body: "Test content 3",
      })
    );
    s3Client.send(
      new PutObjectCommand({
        Bucket: constants.S3_BUCKET_NAME,
        Key: "beta/fileName4.txt",
        Body: "Test content 4",
      })
    );
  } catch (error) {
    console.error(
      constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
      JSON.stringify(error)
    );
  }
};

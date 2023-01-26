import {
  aws_apigateway as apiGateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import RoleAssumingLambda from "./RoleAssumingLambda";
import getConstants from "../lambda/constants";

export class AwsTenantIsolationStack extends Stack {
  readonly constants;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.constants = getConstants(this.stackName);

    const dynamodbTable = new dynamodb.Table(this, this.constants.TABLE_NAME, {
      tableName: this.constants.TABLE_NAME,
      partitionKey: {
        name: this.constants.TABLE_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: this.constants.TABLE_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
    });

    const readDynamoWithLeadingKeysPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [dynamodbTable.tableArn],
      conditions: {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": [
            `\${aws:PrincipalTag/${this.constants.SESSION_TAG_KEY}}`,
          ],
        },
      },
    });

    const dynamodbReadLambda = new RoleAssumingLambda(
      this,
      this.constants.DYNAMODB_READ_LAMBDA_NAME,
      {
        functionName: this.constants.DYNAMODB_READ_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "dynamodbReader.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [readDynamoWithLeadingKeysPolicy],
        assumedRoleArnEnvKey: this.constants.ASSUMED_ROLE_ARN_ENV_KEY_1,
        sessionTag: this.constants.TABLE_PARTITION_KEY,
      }
    );

    const s3Bucket = new s3.Bucket(this, this.constants.S3_BUCKET_NAME, {
      bucketName: this.constants.S3_BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const getBucketObjectWithPrefix = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: [s3Bucket.bucketArn],
      conditions: {
        StringEquals: {
          "s3:prefix": `\${aws:PrincipalTag/${this.constants.SESSION_TAG_KEY}}`,
        },
      },
    });

    const s3BucketReadLambda = new RoleAssumingLambda(
      this,
      this.constants.S3_BUCKET_READ_LAMBDA_NAME,
      {
        functionName: this.constants.S3_BUCKET_READ_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "s3BucketReader.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [getBucketObjectWithPrefix],
        assumedRoleArnEnvKey: this.constants.ASSUMED_ROLE_ARN_ENV_KEY_2,
        sessionTag: this.constants.S3_BUCKET_NAME,
      }
    );

    const api = new apiGateway.RestApi(this, `${this.stackName}API`, {
      restApiName: `${this.stackName}API`,
    });

    api.root.addResource("readDynamodb");
    api.root
      .getResource("readDynamodb")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(dynamodbReadLambda));

    api.root.addResource("readS3Bucket");
    api.root
      .getResource("readS3Bucket")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(s3BucketReadLambda));
  }
}

import {
  aws_apigateway as apiGateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  CustomResource,
  custom_resources as cr,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import constants from "../lambda/constants";
import RoleAssumingLambda from "./RoleAssumingLambda";

export class AwsTenantIsolationStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dynamodbTable = new dynamodb.Table(this, constants.TABLE_NAME, {
      tableName: constants.TABLE_NAME,
      partitionKey: {
        name: constants.TABLE_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: constants.TABLE_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
    });
    dynamodbTable.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const s3Bucket = new s3.Bucket(this, constants.S3_BUCKET_NAME, {
      bucketName: constants.S3_BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    s3Bucket.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const cfnEventHandler = new lambda.Function(
      this,
      constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
      {
        functionName: constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "cfnEventHandler.handler",
        code: lambda.Code.fromAsset("lambda"),
      }
    );
    dynamodbTable.grantWriteData(cfnEventHandler);
    s3Bucket.grantWrite(cfnEventHandler);

    const customResourceProvider = new cr.Provider(
      this,
      "DataInitializerCustomResourceProvider",
      {
        onEventHandler: cfnEventHandler,
        providerFunctionName:
          constants.CFN_EVENT_HANDLER_LAMBDA_NAME + "Provider",
      }
    );
    const customResource = new CustomResource(
      this,
      "DataInitializerCustomResource",
      {
        serviceToken: customResourceProvider.serviceToken,
      }
    );

    const readDynamoWithLeadingKeysPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [dynamodbTable.tableArn],
      conditions: {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": [
            `\${aws:PrincipalTag/${constants.SESSION_TAG_KEY}}`,
          ],
        },
      },
    });

    const dynamodbReadLambda = new RoleAssumingLambda(
      this,
      constants.DYNAMODB_READ_LAMBDA_NAME,
      {
        functionName: constants.DYNAMODB_READ_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "dynamodbReader.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [readDynamoWithLeadingKeysPolicy],
        assumedRoleArnEnvKey: constants.ASSUMED_ROLE_ARN_ENV_KEY_1,
        sessionTag: constants.TABLE_PARTITION_KEY,
      }
    );

    const writeDynamoWithLeadingKeysPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [dynamodbTable.tableArn],
      conditions: {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": [
            `\${aws:PrincipalTag/${constants.SESSION_TAG_KEY}}`,
          ],
        },
      },
    });

    const dynamodbWriteLambda = new RoleAssumingLambda(
      this,
      constants.DYNAMODB_WRITE_LAMBDA_NAME,
      {
        functionName: constants.DYNAMODB_WRITE_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "dynamodbWriter.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [writeDynamoWithLeadingKeysPolicy],
        assumedRoleArnEnvKey: constants.ASSUMED_ROLE_ARN_ENV_KEY_3,
        sessionTag: constants.TABLE_PARTITION_KEY,
      }
    );

    const getBucketObjectWithPrefix = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: [s3Bucket.bucketArn],
      conditions: {
        StringEquals: {
          "s3:prefix": `\${aws:PrincipalTag/${constants.SESSION_TAG_KEY}}`,
        },
      },
    });

    const s3BucketReadLambda = new RoleAssumingLambda(
      this,
      constants.S3_BUCKET_READ_LAMBDA_NAME,
      {
        functionName: constants.S3_BUCKET_READ_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "s3BucketReader.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [getBucketObjectWithPrefix],
        assumedRoleArnEnvKey: constants.ASSUMED_ROLE_ARN_ENV_KEY_2,
        sessionTag: constants.S3_BUCKET_NAME,
      }
    );

    const putBucketObjectWithPrefix = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:PutObject"],
      resources: [s3Bucket.bucketArn],
      conditions: {
        StringEquals: {
          "s3:prefix": `\${aws:PrincipalTag/${constants.SESSION_TAG_KEY}}`,
        },
      },
    });

    const s3BucketWriteLambda = new RoleAssumingLambda(
      this,
      constants.S3_BUCKET_WRITE_LAMBDA_NAME,
      {
        functionName: constants.S3_BUCKET_WRITE_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "s3BucketWriter.handler",
        code: lambda.Code.fromAsset("lambda"),
        assumedRolePolicyStatements: [putBucketObjectWithPrefix],
        assumedRoleArnEnvKey: constants.ASSUMED_ROLE_ARN_ENV_KEY_4,
        sessionTag: constants.S3_BUCKET_NAME,
      }
    );

    const api = new apiGateway.RestApi(this, `${this.stackName}API`, {
      restApiName: `${this.stackName}API`,
    });

    api.root.addResource("readDynamodb");
    api.root
      .getResource("readDynamodb")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(dynamodbReadLambda));

    api.root.addResource("writeDynamodb");
    api.root
      .getResource("writeDynamodb")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(dynamodbWriteLambda));

    api.root.addResource("readS3Bucket");
    api.root
      .getResource("readS3Bucket")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(s3BucketReadLambda));

    api.root.addResource("writeS3Bucket");
    api.root
      .getResource("writeS3Bucket")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(s3BucketWriteLambda));
  }
}

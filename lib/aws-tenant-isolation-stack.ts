import {
  aws_apigateway as apiGateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  CustomResource,
  custom_resources as cr,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import getConstants from "../lambda/constants";
import RoleAssumingLambda from "./RoleAssumingLambda";
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

    const s3Bucket = new s3.Bucket(this, this.constants.S3_BUCKET_NAME, {
      bucketName: this.constants.S3_BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const cfnEventHandler = new lambda.Function(
      this,
      this.constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
      {
        functionName: this.constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "cfnEventHandler.handler",
        code: lambda.Code.fromAsset("lambda"),
      }
    );
    dynamodbTable.grantWriteData(cfnEventHandler);
    s3Bucket.grantPut(cfnEventHandler);

    const customResourceProvider = new cr.Provider(this, "", {
      onEventHandler: cfnEventHandler,
    });
    const customResource = new CustomResource(
      this,
      "DataInitializerCustomResource",
      {
        serviceToken: customResourceProvider.serviceToken,
      }
    );
    customResource.node.addDependency(dynamodbTable);
    customResource.node.addDependency(s3Bucket);

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

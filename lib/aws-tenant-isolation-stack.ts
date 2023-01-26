import {
  aws_apigateway as apiGateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  custom_resources as cr,
  CustomResource,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import getConstants from "../lambda/constants";
import RoleAssumingLambda from "./RoleAssumingLambda";
export class AwsTenantIsolationStack extends Stack {
  readonly constants;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.constants = getConstants("playground");

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
    dynamodbTable.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const s3Bucket = new s3.Bucket(this, this.constants.S3_BUCKET_NAME, {
      bucketName: this.constants.S3_BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    s3Bucket.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const assumedCfnEventHandlerRole = new iam.Role(
      this,
      this.constants.ASSUMED_CFN_EVENT_HANDLER_ROLE_NAME,
      {
        roleName: this.constants.ASSUMED_CFN_EVENT_HANDLER_ROLE_NAME,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );
    assumedCfnEventHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:PutItem"],
        resources: [dynamodbTable.tableArn],
      })
    );
    // assumedCfnEventHandlerRole.addToPolicy(
    //   new iam.PolicyStatement({
    //     effect: iam.Effect.ALLOW,
    //     actions: ["dynamodb:PutItem"],
    //     resources: ["arn:aws:dynamodb:*"],
    //   })
    // );
    assumedCfnEventHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [s3Bucket.bucketArn],
      })
    );
    // assumedCfnEventHandlerRole.addToPolicy(
    //   new iam.PolicyStatement({
    //     effect: iam.Effect.ALLOW,
    //     actions: ["s3:PutObject"],
    //     resources: ["arn:aws:s3:*"],
    //   })
    // );

    const cfnEventHandler = new lambda.Function(
      this,
      this.constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
      {
        functionName: this.constants.CFN_EVENT_HANDLER_LAMBDA_NAME,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "cfnEventHandler.handler",
        code: lambda.Code.fromAsset("lambda"),
        // role: assumedCfnEventHandlerRole,
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
          this.constants.CFN_EVENT_HANDLER_LAMBDA_NAME + "Provider",
        role: assumedCfnEventHandlerRole,
      }
    );
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

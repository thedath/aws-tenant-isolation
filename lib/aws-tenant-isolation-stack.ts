import {
  Stack,
  StackProps,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_apigateway as apiGateway,
  aws_iam as iam,
  CfnOutput,
} from "aws-cdk-lib";
import { AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface AwsTenantIsolationStackProps extends StackProps {
  account: string;
}

export class AwsTenantIsolationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AwsTenantIsolationStackProps
  ) {
    super(scope, id, props);
    props;

    // Define the IAM role

    const testTable = new dynamodb.Table(this, `${this.stackName}testTable`, {
      tableName: `${this.stackName}testTable`,
      partitionKey: { name: "TenantID", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "Timestamp", type: dynamodb.AttributeType.STRING },
    });

    // const dynamodbReadByTenantIDPolicy = new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: [
    //     "dynamodb:BatchGetItem",
    //     "dynamodb:BatchWriteItem",
    //     "dynamodb:DeleteItem",
    //     "dynamodb:GetItem",
    //     "dynamodb:PutItem",
    //     "dynamodb:Query",
    //     "dynamodb:UpdateItem",
    //   ],
    //   resources: [testTable.tableArn],
    //   conditions: {
    //     "ForAllValues:StringEquals": {
    //       "dynamodb:LeadingKeys": ["${aws:PrincipalTag/TenantID}"],
    //     },
    //   },

    // });
    // tenantDataAccessGrantRole.addToPolicy(dynamodbReadByTenantIDPolicy);

    const runner = new lambda.Function(this, `${this.stackName}RunnerLambda`, {
      functionName: `${this.stackName}RunnerLambda`,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "runner.handler",
      code: lambda.Code.fromAsset("lambda"),
      environment: {
        TABLE_NAME: testTable.tableName,
        TABLE_ARN: testTable.tableArn,
      },
    });
    runner.addEnvironment("ASSUMED_BY_ROLE_ARN", runner.role?.roleArn!);

    const tenantDataAccessGrantRole = new iam.Role(
      this,
      `${this.stackName}TenantDataAccessGrantRole`,
      {
        roleName: `${this.stackName}TenantDataAccessGrantRole`,
        assumedBy: new iam.ArnPrincipal(runner.role?.roleArn!),
      }
    );
    runner.addEnvironment(
      "TEMP_SESSION_ROLE_ARN",
      tenantDataAccessGrantRole.roleArn
    );
    tenantDataAccessGrantRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
        ],
        resources: [testTable.tableArn],
      })
    );

    runner.role?.attachInlinePolicy(
      new iam.Policy(this, "runnerInlinePolicy", {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [tenantDataAccessGrantRole.roleArn],
          }),
        ],
      })
    );

    // runner.role?.grantAssumeRole(runner.role);

    // runner.role?.addToPrincipalPolicy(
    //   new iam.PolicyStatement({
    //     effect: iam.Effect.ALLOW,
    //     actions: ["sts:TagSession"],
    //     conditions: {
    //       StringLike: {
    //         "aws:RequestTag/TenantID": "*",
    //       },
    //     },
    //   })
    // );

    // const tenantIsolationInitRole = new iam.Role(
    //   this,
    //   `${this.stackName}TenantIsolationInitRole`,
    //   {
    //     roleName: `${this.stackName}TenantIsolationInitRole`,
    //     assumedBy: new iam.ArnPrincipal(runner.role?.roleArn!),
    //   }
    // );

    // Define the policy statements
    // const assumeRolePolicyStatement = new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: ["sts:AssumeRole"],
    //   // principals: [new iam.ArnPrincipal("lambda.amazonaws.com")],
    // });
    // const tagSessionPolicyStatement = new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: ["sts:TagSession"],
    //   // principals: [new iam.ServicePrincipal("lambda.amazonaws.com")],
    //   conditions: {
    //     StringLike: {
    //       "aws:RequestTag/TenantID": "*",
    //     },
    //   },
    // });
    // tenantIsolationInitRole.addToPolicy(assumeRolePolicyStatement);
    // tenantIsolationInitRole.addToPolicy(tagSessionPolicyStatement);

    new CfnOutput(this, "RoleOutput", {
      exportName: "RoleOutput",
      value: runner.role?.roleArn || "No name",
    });

    new CfnOutput(this, "RolePolicy", {
      exportName: "RolePolicy",
      value:
        JSON.stringify(runner.role?.policyFragment.principalJson) || "No name",
    });

    const api = new apiGateway.RestApi(this, `${this.stackName}API`, {
      restApiName: `${this.stackName}API`,
    });
    api.root.addResource("test");
    api.root
      .getResource("test")
      ?.addMethod("GET", new apiGateway.LambdaIntegration(runner));
  }
}

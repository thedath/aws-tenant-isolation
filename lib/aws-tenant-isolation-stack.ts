import {
  aws_apigateway as apiGateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import RoleAssumingLambda from "./RoleAssumingLambda";

export class AwsTenantIsolationStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // table configuration
    const table = new dynamodb.Table(this, "OrgTable", {
      tableName: "OrgTable",
      partitionKey: { name: "OrgPartK1", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "OrgSortK1", type: dynamodb.AttributeType.STRING },
    });
    table.addGlobalSecondaryIndex({
      indexName: "OrgTableIndex",
      partitionKey: { name: "OrgPartK12", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "OrgSortK2", type: dynamodb.AttributeType.STRING },
    });
    table.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // read lambda configuration
    const readPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [table.tableArn],
      conditions: {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": ["${aws:PrincipalTag/OrgPartK1}/*"],
        },
        "ForAllValues:StringEquals": {
          "dynamodb:Attributes": ["OrgPartK1", "OrgSortK1"],
        },
      },
    });
    const readLambda = new RoleAssumingLambda(this, "TableReadingLambda", {
      functionName: "TableReadingLambda",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "reader.handler",
      code: lambda.Code.fromAsset("lambda"),
      assumedRolePolicyStatements: [readPolicy],
      assumedRoleArnEnvKey: "TABLE_READ_ASSUMED_ROLE",
      sessionTags: ["OrgPartK1", "OrgPartK2"],
    });

    // write lambda configuration
    const writePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [table.tableArn],
      conditions: {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": [
            "${aws:PrincipalTag/OrgPartK1}",
            "${aws:PrincipalTag/OrgPartK1}/*",
            "${aws:PrincipalTag/OrgPartK1}/*/alpha",
          ],
        },
        "ForAllValues:StringEquals": {
          "dynamodb:Attributes": ["TenantId", "Email", "UserName", "UserHobby"],
        },
      },
    });
    const writeLambda = new RoleAssumingLambda(this, "TableWritingLambda", {
      functionName: "TableWritingLambda",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "writer.handler",
      code: lambda.Code.fromAsset("lambda"),
      assumedRolePolicyStatements: [writePolicy],
      assumedRoleArnEnvKey: "TABLE_WRITE_ASSUMED_ROLE",
      sessionTags: ["asd"],
    });

    // API configurations
    const api = new apiGateway.RestApi(this, `${this.stackName}API`, {
      restApiName: `${this.stackName}API`,
    });
    api.root.addResource("read");
    api.root
      .getResource("read")
      ?.addMethod("POST", new apiGateway.LambdaIntegration(readLambda));
    api.root.addResource("write");
    api.root
      .getResource("write")
      ?.addMethod("POST", new apiGateway.LambdaIntegration(writeLambda));
  }
}

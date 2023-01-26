import { Construct } from "constructs";
import { aws_lambda as lambda, aws_iam as iam } from "aws-cdk-lib";

export interface RoleAssumingLambdaProps {
  lambdaFunction: lambda.Function;
  assumedRolePolicyStatements: iam.PolicyStatement[];
  assumedRoleArnEnvKey: string;
  sessionTag?: string;
}

export default class RoleAssumingLambda extends Construct {
  public readonly props: RoleAssumingLambdaProps;
  public lambdaAssumedRole: iam.Role;

  constructor(scope: Construct, id: string, props: RoleAssumingLambdaProps) {
    super(scope, id);
    this.props = props;

    this.lambdaAssumedRole = new iam.Role(
      this,
      `${this.props.lambdaFunction.functionName}AssumingRole`,
      {
        roleName: `${this.props.lambdaFunction.functionName}AssumingRole`,
        assumedBy: this._getLambdaPrincipal(),
      }
    );

    this.props.assumedRolePolicyStatements.forEach(
      (assumedRolePolicyStatement) =>
        this.lambdaAssumedRole.addToPolicy(assumedRolePolicyStatement)
    );

    this.props.lambdaFunction.addEnvironment(
      props.assumedRoleArnEnvKey,
      this.lambdaAssumedRole.roleArn
    );
  }

  private _getLambdaPrincipal(): iam.IPrincipal {
    const lambdaPrincipal = new iam.ArnPrincipal(
      this.props.lambdaFunction.role?.roleArn!
    );

    if (this.props.sessionTag) {
      const taggableLambdaPrincipal = new iam.SessionTagsPrincipal(
        lambdaPrincipal
      );

      taggableLambdaPrincipal.withConditions({
        StringLike: {
          [`aws:RequestTag/${this.props.sessionTag}`]: "*",
        },
      });

      return taggableLambdaPrincipal;
    }

    return lambdaPrincipal;
  }

  public getAssumedRole() {
    return this.lambdaAssumedRole;
  }
}

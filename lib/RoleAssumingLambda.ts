import { Construct } from "constructs";
import { aws_lambda as lambda, aws_iam as iam } from "aws-cdk-lib";

export interface RoleAssumingLambdaProps extends lambda.FunctionProps {
  assumedRolePolicyStatements: iam.PolicyStatement[];
  assumedRoleArnEnvKey: string;
  sessionTag?: string;
}

export default class RoleAssumingLambda extends lambda.Function {
  public readonly props: RoleAssumingLambdaProps;
  public lambdaAssumedRole: iam.Role;

  constructor(scope: Construct, id: string, props: RoleAssumingLambdaProps) {
    super(scope, id, props);
    this.props = props;

    this.lambdaAssumedRole = new iam.Role(
      this,
      `${this.props.functionName}AssumingRole`,
      {
        roleName: `${this.props.functionName}AssumingRole`,
        assumedBy: this._getLambdaPrincipal(),
      }
    );

    this.props.assumedRolePolicyStatements.forEach(
      (assumedRolePolicyStatement) =>
        this.lambdaAssumedRole.addToPolicy(assumedRolePolicyStatement)
    );

    this.addEnvironment(
      props.assumedRoleArnEnvKey,
      this.lambdaAssumedRole.roleArn
    );
  }

  private _getLambdaPrincipal(): iam.IPrincipal {
    const lambdaPrincipal = new iam.ArnPrincipal(this.role?.roleArn!);

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

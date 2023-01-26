export default function getConstants(stackName = "") {
  return {
    ASSUMED_ROLE_ARN_ENV_KEY_A: "DYNAMODB_ACCESSING_ROLE_ARN",
    ASSUMED_ROLE_ARN_ENV_KEY_B: "S3_BUCKET_ACCESSING_ROLE_ARN",

    TABLE_NAME: `${stackName}TestTable`,
    TABLE_PARTITION_KEY: "TenantId",
    TABLE_SORT_KEY: "Email",

    SESSION_TAG_KEY: "TenantId",
    SESSION_TAG_PRE_DEFINED_VALUE: "alpha",

    S3_BUCKET_NAME: "tenantIsolationTestBucket2023",

    DYNAMODB_READ_LAMBDA_NAME: `${stackName}ReadDynamodbLambda`,
    S3_BUCKET_READ_LAMBDA_NAME: `${stackName}ReadS3BucketLambda`,
  };
}

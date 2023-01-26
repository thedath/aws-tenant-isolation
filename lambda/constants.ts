export default function getConstants(stackName = "") {
  return {
    DYNAMODB_READ_LAMBDA_NAME: `${stackName}ReadDynamodbLambda`,
    S3_BUCKET_READ_LAMBDA_NAME: `${stackName}ReadS3BucketLambda`,

    ASSUMED_ROLE_ARN_ENV_KEY_1: "DYNAMODB_READING_ROLE_ARN",
    ASSUMED_ROLE_ARN_ENV_KEY_2: "S3_BUCKET_READING_ROLE_ARN",

    SESSION_TAG_KEY: "TenantId",
    SESSION_TAG_PRE_DEFINED_VALUE: "alpha",

    TABLE_NAME: `${stackName}TestTable`,
    TABLE_PARTITION_KEY: "TenantId",
    TABLE_SORT_KEY: "Email",

    S3_BUCKET_NAME: "tenantisolationtestbucket2023",
  };
}

import { awsCloudProvider } from "./awsProvider";

export type CloudProviderName = "aws";

export function getCloudProvider() {
  return awsCloudProvider;
}

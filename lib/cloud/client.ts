import { awsCloudProvider } from "./awsProvider";
import { noopCloudProvider } from "./noopProvider";
import type { CloudProvider } from "./types";

export type CloudProviderName = "noop" | "supabase" | "aws";

export function getCloudProvider(): CloudProvider {
  const provider = process.env.NEXT_PUBLIC_AHLOGU_CLOUD_PROVIDER as
    | CloudProviderName
    | undefined;

  switch (provider) {
    case "aws":
      return awsCloudProvider;

    case "supabase":
      // Later: return supabaseCloudProvider;
      return noopCloudProvider;

    case "noop":
    default:
      return noopCloudProvider;
  }
}

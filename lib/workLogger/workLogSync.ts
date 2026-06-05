import { getCloudProvider } from "@/lib/cloud/client";
import type { LogItem } from "@/types/work";

export async function uploadWorkLogToAws(item: LogItem): Promise<number> {
  const cloud = getCloudProvider();

  if (cloud.providerName !== "aws") {
    throw new Error("AWS cloud provider is required for work log sync.");
  }

  const result = await cloud.workLogs.upload(item);

  if (!result.ok) {
    throw new Error(result.message || "AWS work log upload failed.");
  }

  return Date.now();
}

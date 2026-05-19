import { getCloudProvider } from "./client";

export async function checkCloudHealth() {
  const cloud = getCloudProvider();
  return cloud.healthCheck();
}

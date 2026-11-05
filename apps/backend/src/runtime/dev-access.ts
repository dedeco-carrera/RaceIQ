import type { DashboardAuth } from "./dashboard-auth";

/** Configure only a pending development installation on an explicitly loopback listener. */
export async function configureDevAccess(auth: DashboardAuth, env: NodeJS.ProcessEnv, compiled: boolean): Promise<boolean> {
  if (compiled || env.NODE_ENV === "production" || env.RACEIQ_DEV_NO_PASSWORD !== "1" || env.SERVER_HOST !== "127.0.0.1" || !(await auth.isPending())) return false;
  const network = await auth.getNetwork();
  if (network.hosts.some((host) => host !== "127.0.0.1" && host !== "::1")) return false;
  await auth.setup(null, true);
  return true;
}

export const STARTUP_CRASH_PROBE_MESSAGE =
  'SHUUT_DIAGNOSTICS_STARTUP_PROBE_7F4C2A';

type StartupCrashProbeEnvironment = {
  channel?: string;
  enabled?: string;
};

export function shouldRunStartupCrashProbe({
  channel,
  enabled,
}: StartupCrashProbeEnvironment): boolean {
  return channel === 'diagnostics' && enabled === 'startup';
}

export function runStartupCrashProbe(environment: StartupCrashProbeEnvironment): void {
  if (shouldRunStartupCrashProbe(environment)) {
    throw new Error(STARTUP_CRASH_PROBE_MESSAGE);
  }
}
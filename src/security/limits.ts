export class TimeRangeExceededError extends Error {
  constructor(actualMinutes: number, maxMinutes: number) {
    super(
      `Query time range of ${actualMinutes} minutes exceeds the configured maximum of ${maxMinutes} minutes`,
    );
    this.name = 'TimeRangeExceededError';
  }
}

export function enforceTimeRangeLimit(
  startTime: Date,
  endTime: Date,
  maxMinutes: number,
): void {
  const diffMs = endTime.getTime() - startTime.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  if (diffMinutes > maxMinutes) {
    throw new TimeRangeExceededError(Math.round(diffMinutes), maxMinutes);
  }
}

export function clampResultLimit(requested: number | undefined, max: number): number {
  if (requested === undefined) return Math.min(100, max);
  return Math.min(requested, max);
}

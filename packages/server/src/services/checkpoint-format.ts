import type { Prisma } from '../generated/postgresql/client.js';

/**
 * Bumped whenever the on-disk checkpoint `snapshot` shape changes in a way
 * that older readers can't parse. Callers should never need to know the
 * number; it exists to give `readCheckpointEntries` an unambiguous signal.
 */
export const CHECKPOINT_FORMAT = 2;

/** A checkpoint row: the value plus the metadata a restore must reinstate. */
export type CheckpointEntry = {
  value: Prisma.InputJsonValue;
  version: number;
  expiresAt: string | null;
};

/**
 * A checkpoint snapshot in the current format.
 *
 * The `__format` marker exists so readers never have to guess. Snapshots
 * written before this format was introduced are bare `key -> value` maps,
 * and any state value may itself look like an envelope (e.g. an ordinary
 * versioned config record stored as `{value: 'dark', version: 2}`), so
 * duck-typing individual entries cannot distinguish the two safely — only a
 * root-level marker can.
 */
export type CheckpointSnapshot = {
  __format: typeof CHECKPOINT_FORMAT;
  entries: Record<string, CheckpointEntry>;
};

/** The subset of a `state` row that a checkpoint snapshot needs to capture. */
export type CheckpointableStateRow = {
  key: string;
  value: Prisma.JsonValue;
  version: number;
  expiresAt: Date | null;
};

/** Builds a current-format checkpoint snapshot from `prisma.state.findMany` rows. */
export function buildCheckpointSnapshot(
  rows: CheckpointableStateRow[],
): CheckpointSnapshot {
  return {
    __format: CHECKPOINT_FORMAT,
    entries: Object.fromEntries(
      rows.map((row) => [
        row.key,
        {
          value: row.value as Prisma.InputJsonValue,
          version: row.version,
          expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        },
      ]),
    ),
  };
}

function isCurrentFormat(
  snapshot: unknown,
): snapshot is { __format: typeof CHECKPOINT_FORMAT; entries: Record<string, unknown> } {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return false;
  }
  const candidate = snapshot as { __format?: unknown; entries?: unknown };
  return (
    candidate.__format === CHECKPOINT_FORMAT &&
    candidate.entries !== null &&
    typeof candidate.entries === 'object' &&
    !Array.isArray(candidate.entries)
  );
}

/**
 * Accepts a stored `expiresAt` only if it is a string that parses to a valid
 * date. Snapshot entries are arbitrary persisted JSON — never hand an
 * unchecked value to `new Date()`, since an invalid value (e.g. `'never'`)
 * would later blow up `restoreCheckpoint`'s `createMany` and make that
 * checkpoint permanently unrestorable.
 */
function safeExpiresAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/**
 * Reads a checkpoint snapshot in either format.
 *
 * Checkpoints written before this format was introduced stored a bare
 * `key -> value` map. Those still restore, defaulting to version 1 and no
 * TTL. Format detection requires *both* `__format === CHECKPOINT_FORMAT`
 * *and* an `entries` object at the top level — never per-entry duck-typing,
 * because an ordinary state value can itself look exactly like an envelope
 * (see the module doc comment on `CheckpointSnapshot`).
 *
 * Honesty check: a legacy (pre-format) snapshot whose *only* two state keys
 * happen to be named exactly `__format` (holding the value `2`) and
 * `entries` would still be misread as current-format. That requires a
 * workflow with precisely those two keys and no others — vanishingly
 * unlikely, but not impossible, so it's called out here rather than
 * silently assumed away.
 */
export function readCheckpointEntries(
  snapshot: unknown,
): Record<string, CheckpointEntry> {
  if (isCurrentFormat(snapshot)) {
    return Object.fromEntries(
      Object.entries(snapshot.entries).map(([key, raw]) => {
        const entry = raw as Partial<CheckpointEntry> | null;
        return [
          key,
          {
            value: (entry?.value ?? null) as Prisma.InputJsonValue,
            version: typeof entry?.version === 'number' ? entry.version : 1,
            expiresAt: safeExpiresAt(entry?.expiresAt),
          },
        ];
      }),
    );
  }

  return Object.fromEntries(
    Object.entries((snapshot ?? {}) as Record<string, unknown>).map(
      ([key, raw]) => [
        key,
        { value: raw as Prisma.InputJsonValue, version: 1, expiresAt: null },
      ],
    ),
  );
}

/**
 * Flattens a checkpoint snapshot to a plain `key -> value` map, for diffing
 * and display where the version/expiry metadata isn't relevant. Handles both
 * the current envelope format and pre-envelope bare-value snapshots.
 */
export function snapshotValues(snapshot: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(readCheckpointEntries(snapshot)).map(([key, entry]) => [
      key,
      entry.value,
    ]),
  );
}

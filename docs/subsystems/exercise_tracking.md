# Exercise Tracking

Neotoma uses a per-set entity model for exercise data: each exercise set is stored as a separate `exercise_set` entity, and the workout session is stored as an `exercise_log` entity. Sets are linked to their parent session via a `PART_OF` relationship.

## Entity types

### `exercise_log` — workout session container

Represents one workout session (e.g. "Upper Body — 2026-05-16"). Fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | date | yes | Date of the workout |
| `workout_type` | string | no | Session label (e.g. "Upper Body", "Cardio", "Legs") |
| `duration_minutes` | number | no | Total session duration |
| `notes` | string | no | Free-form notes about the session |
| `location` | string | no | Where the workout took place |

Identity: `date + workout_type` (falls back to `date` alone for untyped sessions).

### `exercise_set` — one set within a session

Represents one atomic set performed during a session (e.g. "Bench Press, Set 1, 135 lbs × 8 reps, 2026-05-16"). Fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `exercise_name` | string | yes | Name of the exercise (e.g. "Bench Press") |
| `date` | date | yes | Date the set was performed |
| `set_number` | number | no | Set index within the exercise (1, 2, 3, …) |
| `set_type` | string | no | Set type (e.g. "working", "warmup", "dropset") |
| `reps` | number | no | Repetitions completed |
| `weight_lbs` | number | no | Load in pounds |
| `weight_kg` | number | no | Load in kilograms |
| `duration_seconds` | number | no | Duration in seconds (timed sets) |
| `distance_meters` | number | no | Distance in meters (cardio sets) |
| `notes` | string | no | Free-form notes |

Identity: `exercise_name + set_number + date` (falls back to `exercise_name + date` when `set_number` is absent).

## Relationship model

```
exercise_set  --PART_OF-->  exercise_log
```

Each `exercise_set` entity carries a `PART_OF` relationship to its parent `exercise_log`. This follows the standard Neotoma one-to-many child model.

## Storing a workout

1. Store the `exercise_log` session entity first.
2. Store each `exercise_set` entity with a `PART_OF` relationship pointing to the log's `entity_id`.

### Example: one `store` call with inline relationships

```json
{
  "entities": [
    {
      "entity_type": "exercise_log",
      "date": "2026-05-16",
      "workout_type": "Upper Body",
      "duration_minutes": 60
    },
    {
      "entity_type": "exercise_set",
      "exercise_name": "Bench Press",
      "date": "2026-05-16",
      "set_number": 1,
      "reps": 8,
      "weight_lbs": 135
    },
    {
      "entity_type": "exercise_set",
      "exercise_name": "Bench Press",
      "date": "2026-05-16",
      "set_number": 2,
      "reps": 8,
      "weight_lbs": 135
    }
  ],
  "relationships": [
    { "relationship_type": "PART_OF", "source_index": 1, "target_index": 0 },
    { "relationship_type": "PART_OF", "source_index": 2, "target_index": 0 }
  ],
  "idempotency_key": "workout-2026-05-16-upper-body"
}
```

### Example: two separate `store` calls

When the session is already stored:

```json
// Call 1 — store the session
{
  "entities": [
    {
      "entity_type": "exercise_log",
      "date": "2026-05-16",
      "workout_type": "Upper Body"
    }
  ],
  "idempotency_key": "workout-2026-05-16-upper-body"
}

// Call 2 — store a set and link it
{
  "entities": [
    {
      "entity_type": "exercise_set",
      "exercise_name": "Bench Press",
      "date": "2026-05-16",
      "set_number": 1,
      "reps": 8,
      "weight_lbs": 135
    }
  ],
  "relationships": [
    {
      "relationship_type": "PART_OF",
      "source_index": 0,
      "target_entity_id": "<exercise_log entity_id from call 1>"
    }
  ],
  "idempotency_key": "exercise-set-bench-press-1-2026-05-16"
}
```

## Querying

Retrieve all sets for a session:

```
retrieve_related_entities(entity_id=<exercise_log entity_id>, relationship_type="PART_OF", direction="inbound")
```

Retrieve all sessions:

```
retrieve_entities(entity_type="exercise_log")
```

## Related entity types

- `workout_session` — an older session container that accumulates exercises as an `exercises` array field via `merge_array` reducer strategy. Use `exercise_log` + `exercise_set` for new data; `workout_session` remains supported for backward compatibility.
- `exercise` — a generic exercise activity entity without per-set breakdown. Use `exercise_set` when per-set granularity is needed.

# Job Alert Service

Microservice that sends email notifications when jobs in the triplestore reach a specific status (e.g., failed). Designed for the [mu.semte.ch](https://mu.semte.ch/) microservices stack.

See also the [loket-error-alert-service](https://github.com/lblod/loket-error-alert-service) for a similar service - on which this one is based - that alerts on errors.

## How It Works

1. The service listens for delta notifications from [delta-notifier](https://github.com/mu-semtech/delta-notifier)
2. When a job's `adms:status` changes to a monitored status (default: `failed`), it triggers an alert
3. The service fetches job details including associated tasks and their errors
4. An email is created in the triplestore for the [mail-delivery-service](https://github.com/redpencilio/deliver-email-service) to send
5. Duplicate alerts for the same job are prevented

## Installation

### Docker Compose

Add the service to your `docker-compose.yml`:

```yaml
job-alert:
  image: lblod/job-alert-service:latest
  environment:
    EMAIL_FROM: "noreply@example.com"
    EMAIL_TO: "alerts@example.com"
  volumes:
    - ./config/job-alert:/config/
  labels:
    - "logging=true"
  restart: always
```

### Delta Notifier Configuration

Add a rule to your `config/delta/rules.js` to trigger on job status changes:

```javascript
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://www.w3.org/ns/adms#status'
    },
    object: {
      type: 'uri',
      value: 'http://redpencil.data.gift/id/concept/JobStatus/failed'
    }
  },
  callback: {
    url: 'http://job-alert/delta',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 1000,
    ignoreFromSelf: true
  }
}
```

To monitor multiple statuses, add additional rules or use a more flexible match pattern.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_FROM` | Yes | - | Sender email address |
| `EMAIL_TO` | Yes | - | Recipient email address(es) |
| `DEBUG` | No | `false` | Enable debug logging |
| `JOB_STATUSES` | No | `http://redpencil.data.gift/id/concept/JobStatus/failed` | Comma-separated list of job status URIs to trigger alerts |
| `JOB_OPERATIONS` | No | (all) | Comma-separated list of job operation URIs to filter on |

### Config File

Mount a `config.json` file at `/config/config.json` for additional configuration:

```json
{
  "creators": [
    "http://redpencil.data.gift/id/scheduled-job/example-1",
    "http://redpencil.data.gift/id/scheduled-job/example-2"
  ],
  "email": {
    "folder": "http://data.lblod.info/id/mail-folders/2"
  },
  "graph": {
    "email": "http://mu.semte.ch/graphs/system/email",
    "job": "http://mu.semte.ch/graphs/jobs"
  },
  "service": {
    "uri": "http://lblod.data.gift/services/job-alert-service"
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `creators` | `[]` | Filter jobs by creator URIs (empty = all creators) |
| `email.folder` | `http://data.lblod.info/id/mail-folders/2` | Mail folder URI for outgoing emails |
| `graph.email` | `http://mu.semte.ch/graphs/system/email` | Graph to store email data |
| `graph.job` | `http://mu.semte.ch/graphs/jobs` | Graph to query job data |
| `service.uri` | `http://lblod.data.gift/services/job-alert-service` | Service identifier URI |

## Data Model

### Job (cogs:Job)

The service monitors jobs with these properties:

| Property | Predicate | Description |
|----------|-----------|-------------|
| UUID | `mu:uuid` | Unique identifier |
| Status | `adms:status` | Job status URI |
| Operation | `task:operation` | Job operation type |
| Created | `dcterms:created` | Creation timestamp |
| Modified | `dcterms:modified` | Last modification timestamp |
| Creator | `dcterms:creator` | Scheduled job that created this job |

### Task (task:Task)

Tasks associated with jobs:

| Property | Predicate | Description |
|----------|-----------|-------------|
| UUID | `mu:uuid` | Unique identifier |
| Part Of | `dcterms:isPartOf` | Parent job URI |
| Status | `adms:status` | Task status URI |
| Operation | `task:operation` | Task operation type |
| Index | `task:index` | Task sequence number |

### Email (nmo:Email)

Generated alert emails:

| Property | Predicate | Description |
|----------|-----------|-------------|
| UUID | `mu:uuid` | Unique identifier |
| Subject | `nmo:messageSubject` | Email subject |
| Content | `nmo:htmlMessageContent` | HTML email body |
| To | `nmo:emailTo` | Recipient address |
| From | `nmo:messageFrom` | Sender address |
| Folder | `nie:url` | Mail folder URI |
| References | `dcterms:references` | Job URI this alert is for |
| Creator | `dcterms:creator` | Service URI |

## API

### GET /

Health check endpoint. Returns a welcome message.

### POST /delta

Receives delta notifications from the delta-notifier. Processes job status changes and creates alert emails.

**Request Body**: Delta notification in mu-delta-notifier format (v0.0.1)

**Response**:
- `204 No Content` - Delta received and being processed

### POST /create-alerts

Manually create alerts for jobs with monitored statuses. Creates alerts for any matching jobs that don't have an alert yet. Useful for:
- Catching up on jobs that failed before the service was deployed
- Re-creating alerts after configuration changes
- Testing the service

**Query Parameters**:
- `since` (optional): ISO date string to only include jobs modified after this date

**Examples**:
```bash
# Create alerts for all jobs with monitored status
curl -X POST http://localhost/job-alert/create-alerts

# Create alerts only for jobs modified in the last 24 hours
curl -X POST "http://localhost/job-alert/create-alerts?since=2025-12-04T00:00:00Z"
```

**Response**:
- `200 OK` with JSON body:
```json
{
  "message": "Created 3 alert(s) for 3 matching job(s).",
  "found": 3,
  "created": 3
}
```

### POST /dry-run

Preview which jobs would receive alerts without actually creating emails. Useful for testing configuration and verifying filters.

**Query Parameters**:
- `since` (optional): ISO date string to only scan jobs modified after this date

**Examples**:
```bash
# Preview all jobs that would be alerted
curl -X POST http://localhost/job-alert/dry-run

# Preview jobs modified since a specific date
curl -X POST "http://localhost/job-alert/dry-run?since=2025-12-01T00:00:00Z"
```

**Response**:
- `200 OK` with JSON body:
```json
{
  "message": "Dry run completed. Found 2 job(s) that would receive alerts.",
  "count": 2,
  "jobs": [
    {
      "uri": "http://redpencil.data.gift/id/job/09a37dbd-fa74-45fa-a1c6-db0e74fdde4b",
      "uuid": "09a37dbd-fa74-45fa-a1c6-db0e74fdde4b",
      "status": "http://redpencil.data.gift/id/concept/JobStatus/failed",
      "statusLabel": "failed",
      "operation": "http://lblod.data.gift/id/jobs/concept/JobOperation/lblodHarvesting",
      "operationLabel": "lblodHarvesting",
      "created": "2025-12-04T19:00:00.099Z",
      "modified": "2025-12-04T19:47:12.623Z",
      "creator": "http://redpencil.data.gift/id/scheduled-job/6800FD42CCA2A6922DB9C223"
    }
  ]
}
```

## Example

When a job fails, the service generates an email like:

**Subject**: `[JOB FAILED] 2025-12-04T19:47:12.623Z | lblodHarvesting`

**Content**: HTML email containing:
- Job URI and UUID
- Status and operation type
- Creation and modification timestamps
- List of associated tasks with their status
- Error messages from failed tasks

## Related Services

- [loket-error-alert-service](https://github.com/lblod/loket-error-alert-service) - Similar service for OSLC errors
- [delta-notifier](https://github.com/mu-semtech/delta-notifier) - Triggers this service on data changes
- [deliver-email-service](https://github.com/redpencilio/deliver-email-service) - Sends the generated emails

## License

MIT

# Orchestrator Skill

**Version:** 1.0.0  
**Role:** Orchestrator  
**Authorization Level:** 3 (Orchestrator - Full System Control)  
**Type:** Coordinator / Meta-Agent

## Overview

The **Orchestrator** skill coordinates execution of multiple agent skills in parallel or sequential mode, with intelligent dependency management and comprehensive result aggregation.

## Use Cases

- **Full workflow automation:** Run multiple analysis, audit, and transformation skills in one orchestrated flow
- **Parallel analysis:** Execute code-analysis and security-audit in parallel for faster results
- **Dependency chains:** Automatically handle skill dependencies (e.g., analysis → refactor → testing)
- **Batch operations:** Process multiple findings across different analysis tools
- **Custom workflows:** Build flexible skill pipelines with configurable execution modes

## Input Schema

```json
{
  "mode": "parallel|sequential",
  "skills": ["code-analysis", "security-audit", ...],
  "project_root": "/path/to/project",
  "timeout_per_skill": 30000,
  "dry_run": true,
  "skip_on_error": true,
  "retry_policy": {
    "enabled": true,
    "max_attempts": 3,
    "base_delay_ms": 250,
    "max_delay_ms": 4000,
    "multiplier": 2,
    "jitter": true
  },
  "conditions": {
    "refactor": {
      "all": [
        { "path": "results.code-analysis.status", "op": "==", "value": "success" },
        { "path": "results.security-audit.output.findings", "op": "exists" }
      ]
    }
  },
  "output_projection": {
    "default": ["summary", "findings"],
    "code-analysis": ["summary", "findings", "metadata"]
  }
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | string | `parallel` | Execution mode: `parallel` or `sequential` |
| `skills` | array | All available | List of skill IDs to execute |
| `project_root` | string | Current directory | Project root path |
| `timeout_per_skill` | number | 30000 | Timeout per skill in milliseconds |
| `dry_run` | boolean | true | If true, don't write files |
| `skip_on_error` | boolean | true | Continue execution on error |
| `retry_policy` | object/boolean | enabled | Exponential backoff retry controls (or `false` to disable) |
| `conditions` | object | `{}` | Conditional execution rules per skill (safe DSL) |
| `output_projection` | object/array | `null` | Return only selected output paths per skill |

### Condition DSL (Safe)

Supported operators:
- `==`, `!=`, `>`, `>=`, `<`, `<=`, `exists`, `contains`

Supported logic:
- `all`, `any`, `not`

Path examples:
- `results.code-analysis.status`
- `results.security-audit.output.findings`
- `input.dry_run`

### Available Skills

- `code-analysis` - Code quality and complexity analysis (authLevel: 1)
- `security-audit` - Security vulnerability scanning (authLevel: 1)
- `refactor` - Code refactoring suggestions (authLevel: 2)
- `test-generator` - Auto-generate unit tests (authLevel: 2)
- `doc-generator` - Generate documentation (authLevel: 2)
- `code-formatter` - Auto-format code (authLevel: 2)
- `file-operations` - File reading/operations (authLevel: 1)
- `http-request` - HTTP request execution (authLevel: 1)
- `data-transform` - Data transformation (authLevel: 1)
- `logging` - Logging utilities (authLevel: 1)
- `system-command` - System command execution (authLevel: 2)

## Execution Modes

### Parallel Mode
Executes skills in parallel groups, respecting dependencies:
- Read-only skills run together
- Dependent skills wait for dependencies
- Faster overall execution time
- Ideal for independent analysis tasks

```
code-analysis ──┐
                ├─→ refactor ──→ test-generator
security-audit ┘
```

### Sequential Mode
Executes skills one after another:
- Each skill waits for the previous one
- Results from previous skills feed into next skills
- Slower but allows complex data pipelines
- Ideal for transformation workflows

```
code-analysis → security-audit → refactor → test-generator
```

## Output Schema

```json
{
  "workflow_id": "uuid-v4",
  "mode": "parallel|sequential",
  "status": "success|partial|failed|error",
  "duration_ms": 5000,
  "results": [
    {
      "skill_id": "code-analysis",
      "status": "success|failed|skipped",
      "output": { "findings": [], "summary": {} },
      "duration_ms": 1200,
      "error": null,
      "executed_at": "2026-04-09T12:00:00Z"
    }
  ],
  "aggregated_summary": {
    "workflow_status": "success|partial|failed",
    "total_skills_executed": 6,
    "total_skills_success": 6,
    "total_skills_failed": 0,
    "total_skills_skipped": 0,
    "total_duration_ms": 5000,
    "aggregated_findings": [],
    "findings_by_severity": {
      "CRITICAL": 2,
      "HIGH": 5,
      "MEDIUM": 12,
      "LOW": 8,
      "INFO": 3
    },
    "errors": [],
    "warnings": []
  },
  "progress_summary": {
    "completed": 4,
    "total": 4,
    "percentage": 100,
    "success": 4,
    "failed": 0,
    "skipped": 0,
    "elapsed_ms": 5000,
    "eta_ms": 0,
    "finished": true
  },
  "text_report": "Human-readable workflow report",
  "timestamp": "2026-04-09T12:00:05Z"
}
```

## Skill Dependencies

The orchestrator automatically manages skill dependencies:

```yaml
code-analysis:
  - No dependencies
  - Runs first in parallel mode

security-audit:
  - No dependencies
  - Runs in parallel with code-analysis

refactor:
  - Depends on: code-analysis
  - Uses findings from code-analysis as input

test-generator:
  - Depends on: code-analysis
  - Uses findings to generate appropriate tests

doc-generator:
  - Depends on: code-analysis
  - Uses code findings to document issues

code-formatter:
  - No dependencies
  - Can run independently
```

## Authorization Requirements

The **Orchestrator** skill requires:
- **authLevel >= 3** (Orchestrator role)

Each executed skill must be authorized at the agent's level:
- Read-only skills: authLevel >= 1
- Write skills (refactor, test-generator, doc-generator, code-formatter, system-command): authLevel >= 2

## Examples

### Example 1: Parallel Analysis
```javascript
{
  "mode": "parallel",
  "skills": ["code-analysis", "security-audit"],
  "project_root": "/my/project"
}
```
Result: Both analysis skills run in parallel (takes ~2s instead of ~4s)

### Example 2: Full Workflow
```javascript
{
  "mode": "sequential",
  "skills": [
    "code-analysis",
    "security-audit",
    "refactor",
    "test-generator"
  ],
  "project_root": "/my/project",
  "dry_run": false
}
```
Result: 
1. Analyze code
2. Audit security
3. Generate refactoring patches
4. Generate tests based on findings

### Example 3: Custom Skill Set
```javascript
{
  "mode": "parallel",
  "skills": [
    "code-analysis",
    "doc-generator"
  ],
  "timeout_per_skill": 45000,
  "skip_on_error": false
}
```

## Workflow Status

The orchestrator returns one of four workflow statuses:

| Status | Meaning |
|--------|---------|
| `success` | All skills executed successfully |
| `partial` | Some skills failed or skipped, but workflow continued |
| `failed` | One or more critical skills failed |
| `error` | Workflow failed during initialization or validation |

## Error Handling

### With `skip_on_error: true` (default)
- Failed skills are logged but don't stop the workflow
- Subsequent skills continue executing
- Workflow status becomes `partial` if any skill fails
- Max 3 consecutive errors will stop the workflow

### With `skip_on_error: false`
- First skill failure stops the entire workflow
- Workflow status becomes `failed`
- Subsequent skills are not executed

## Performance Considerations

- **Parallel mode:** Recommended for independent read-only skills (code-analysis, security-audit)
- **Sequential mode:** Required for dependency chains (analysis → refactor → testing)
- **Timeouts:** Set higher timeouts for slower operations (test-generator, doc-generator)
- **dry_run:** Always use `dry_run: true` for testing before writing files
- **Retry policy:** Keep retries enabled for transient failures (timeout/spawn/network)
- **Projection:** Use `output_projection` to reduce payload size in large workflows

## Caching & Memory

The orchestrator stores workflow metadata in the agent's memory system:
- Key: `orchestrator:workflow:{workflow_id}`
- TTL: 24 hours
- Tags: `[orchestrator, workflow]`

Retrievable for auditing and analytics.

## Limitations

1. Maximum 11 skills per workflow (all available skills)
2. Maximum timeout per skill: 5 minutes (300,000ms)
3. Sequential mode slower than parallel for independent skills
4. Results aggregation combines findings from all sources (may include duplicates)

## Future Enhancements

- [ ] Skill scheduling and prioritization
- [ ] Multi-workflow coordination
- [ ] Webhook notifications
- [ ] Custom aggregation rules

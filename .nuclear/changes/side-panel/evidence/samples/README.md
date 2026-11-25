# Intake runner retry

The intake runner now retries a failed intake **three times** with backoff before it marks the capture as stuck.

## What changed

| File | Change |
|---|---|
| `runner/intake.go` | Retry loop with jittered backoff |
| `runner/intake_test.go` | Three new tests |

- [x] Retry with backoff
- [x] Tests
- [ ] Docs page

```go
for attempt := 1; attempt <= 3; attempt++ {
    if err := run(ctx); err == nil {
        return nil
    }
    time.Sleep(backoff(attempt))
}
```

See the [design note](https://example.com/design).

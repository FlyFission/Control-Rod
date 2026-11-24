package runner

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ompAdapter struct{ sandboxedBase }

// Compile-time checks for optional adapter interfaces.
var (
	_ AwaitingConfinement  = ompAdapter{}
	_ StreamMetadataParser = ompAdapter{}
)

// ConfinementGap keeps this runtime listed and probeable but never started; see AwaitingConfinement.
func (ompAdapter) ConfinementGap() string {
	return "Control Rod does not yet configure OS confinement for Oh My Pi from the run's sandbox policy, omp's --tools flag is not a security boundary, and omp awaits OS confinement and multi-vendor model attestation qualification under ADR 0021."
}

func (ompAdapter) ID() string          { return RuntimeOmp }
func (ompAdapter) Binary() string      { return "omp" }
func (ompAdapter) DisplayName() string { return "Oh My Pi" }

func (ompAdapter) Providers() []string {
	return []string{"omp", "oh-my-pi"}
}

func (a ompAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (ompAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check"},
		OutputFormat:     "json",
		ToolAllowlist:    false,
		NativeSandbox:    "none",
		NetworkHostLimit: false,
		MultiVendor:      true,
		ConfigIsolation:  []string{"--no-session", "PI_CODING_AGENT_DIR"},
	}
}

func (a ompAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

// OmpThinkingLevel normalizes an effort/reasoning level to one of omp's supported
// --thinking values, or returns "" when omitted, "default", or unrecognized.
func OmpThinkingLevel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "off", "minimal", "low", "medium", "high", "max":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return ""
	}
}

// splitOmpModelEffort separates a trailing ":<effort>" suffix (e.g.
// "anthropic/claude-sonnet-4-6:high") into model and thinking level, while leaving
// model tags such as "ollama/qwen2.5-coder:32b" untouched.
func splitOmpModelEffort(model string) (baseModel, effort string) {
	idx := strings.LastIndex(model, ":")
	if idx <= 0 || idx == len(model)-1 {
		return model, ""
	}
	if lvl := OmpThinkingLevel(model[idx+1:]); lvl != "" {
		return model[:idx], lvl
	}
	return model, ""
}

// OmpConfigDir returns an isolated per-run agent config directory inside the run
// workspace so Control Rod never reads or mutates the user's ~/.omp/ directory.
func OmpConfigDir(ws *Workspace) string {
	if ws == nil {
		return ""
	}
	if ws.Scratch != "" {
		return filepath.Join(ws.Scratch, "omp-agent")
	}
	if ws.Dir != "" {
		return filepath.Join(ws.Dir, ".omp-agent")
	}
	return ""
}

// OmpIsolatedEnv returns the per-run environment overrides for an omp invocation:
// an isolated PI_CODING_AGENT_DIR inside the workspace plus flags disabling hidden
// in-run subagents and advisors (ADR 0023 Decision 5).
func OmpIsolatedEnv(ws *Workspace) []string {
	var env []string
	if dir := OmpConfigDir(ws); dir != "" {
		env = append(env, "PI_CODING_AGENT_DIR="+dir)
	}
	env = append(env, "OMP_DISABLE_SUBAGENTS=1", "OMP_DISABLE_ADVISOR=1")
	return env
}

// OmpArgs builds the non-interactive argument list for an omp run.
func OmpArgs(run Run, ws *Workspace, thinking string) []string {
	args := []string{"--print", "--mode", "json", "--no-session"}
	model := RequestedModel(run)
	effort := OmpThinkingLevel(thinking)
	if model != "" {
		baseModel, inlineEffort := splitOmpModelEffort(model)
		model = baseModel
		if effort == "" {
			effort = inlineEffort
		}
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if effort != "" {
		args = append(args, "--thinking", effort)
	}
	prompt := Prompt
	if run.Role == "pre-check" || (ws != nil && ws.Checker) {
		prompt = CheckerPrompt
	}
	return append(args, prompt)
}

func (a ompAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, ErrNoPolicy
	}
	if err := confinementRefusal(a); err != nil {
		return nil, err
	}
	cmd := exec.Command(a.Binary(), OmpArgs(run, ws, "")...)
	if ws != nil {
		cmd.Dir = ws.Dir
	}
	cmd.Env = withEnv(AgentEnv(os.Environ()), OmpIsolatedEnv(ws)...)
	return cmd, nil
}

func (ompAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}

// TurnEnd reports whether one omp --mode json stdout line marks the end of the turn.
func (ompAdapter) TurnEnd(line string) (ended, failed bool) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "{") {
		return false, false
	}
	var ev struct {
		Type         string `json:"type"`
		Subtype      string `json:"subtype"`
		Status       string `json:"status"`
		IsError      bool   `json:"is_error"`
		IsErrorCamel bool   `json:"isError"`
		Error        any    `json:"error"`
	}
	if json.Unmarshal([]byte(trimmed), &ev) != nil || ev.Type == "" {
		return false, false
	}
	hasErr := ev.IsError || ev.IsErrorCamel ||
		strings.EqualFold(ev.Status, "error") || strings.EqualFold(ev.Status, "failed") ||
		strings.HasPrefix(strings.ToLower(ev.Subtype), "error") ||
		ompErrorText(ev.Error) != ""
	switch ev.Type {
	case "turn_end", "agent_end", "result", "done":
		return true, hasErr
	case "error":
		return true, true
	default:
		return false, false
	}
}

// Normalize turns one omp --mode json line into Control Rod events. Non-JSON and
// unrecognized lines return nil without panicking.
func (ompAdapter) Normalize(line string, now time.Time) []Event {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "{") {
		return nil
	}
	var ev map[string]any
	if json.Unmarshal([]byte(trimmed), &ev) != nil {
		return nil
	}
	typ := mapStr(ev, "type")
	if typ == "" {
		return nil
	}
	at := now.UTC().Format(time.RFC3339Nano)
	var out []Event

	switch typ {
	case "text_delta":
		if t := clipText(firstNonEmpty(mapStr(ev, "delta"), mapStr(ev, "text"))); t != "" {
			out = append(out, Event{Kind: EvMessage, At: at, Text: t})
		}
	case "message_update":
		if delta := ompMessageUpdateText(ev); delta != "" {
			out = append(out, Event{Kind: EvMessage, At: at, Text: clipText(delta)})
		}
	case "assistant", "message_end":
		msg, _ := ev["message"].(map[string]any)
		if msg == nil {
			msg = ev
		}
		out = append(out, ompContentEvents(msg["content"], at)...)
		if text := mapStr(ev, "text"); text != "" && len(out) == 0 {
			out = append(out, Event{Kind: EvMessage, At: at, Text: clipText(text)})
		}
		if u := ompUsageEvent(msg["usage"], at, false); u != nil {
			out = append(out, *u)
		}
	case "tool_execution_start", "tool_call", "tool_start":
		name := firstNonEmpty(mapStr(ev, "toolName"), mapStr(ev, "name"), mapStr(ev, "tool"))
		callID := firstNonEmpty(mapStr(ev, "toolCallId"), mapStr(ev, "call_id"), mapStr(ev, "id"))
		args, _ := ev["args"].(map[string]any)
		if args == nil {
			args, _ = ev["input"].(map[string]any)
		}
		rawInput := ev["args"]
		if rawInput == nil {
			rawInput = ev["input"]
		}
		out = append(out, Event{
			Kind:        EvToolStart,
			At:          at,
			Tool:        token(name, 60),
			Summary:     ompToolLabel(name, args),
			InputDigest: digestOf(rawInput),
			CallID:      token(callID, 80),
		})
	case "tool_execution_end", "tool_result", "tool_end":
		name := firstNonEmpty(mapStr(ev, "toolName"), mapStr(ev, "name"), mapStr(ev, "tool"))
		callID := firstNonEmpty(mapStr(ev, "toolCallId"), mapStr(ev, "call_id"), mapStr(ev, "id"))
		failed := mapBool(ev, "isError") || mapBool(ev, "is_error") || ompErrorText(ev["error"]) != ""
		e := Event{
			Kind:   EvToolEnd,
			At:     at,
			Tool:   token(name, 60),
			CallID: token(callID, 80),
			OK:     yes(!failed),
		}
		if failed {
			errMsg := firstNonEmpty(ompErrorText(ev["error"]), resultText(ev["result"]), resultText(ev["content"]))
			if errMsg != "" {
				e.Text = clipText(errMsg)
			}
		}
		out = append(out, e)
	case "usage":
		if u := ompUsageEvent(ev, at, false); u != nil {
			out = append(out, *u)
		}
	case "turn_end", "agent_end", "result", "done":
		failed := mapBool(ev, "isError") || mapBool(ev, "is_error") ||
			strings.EqualFold(mapStr(ev, "status"), "error") ||
			strings.EqualFold(mapStr(ev, "status"), "failed") ||
			strings.HasPrefix(strings.ToLower(mapStr(ev, "subtype")), "error") ||
			ompErrorText(ev["error"]) != ""
		if failed {
			errMsg := firstNonEmpty(ompErrorText(ev["error"]), mapStr(ev, "message"), mapStr(ev, "result"))
			out = append(out, Event{Kind: EvError, At: at, Text: clipText(errMsg)})
		}
		cumulative := typ == "result" || typ == "agent_end"
		usageObj := ev["usage"]
		if usageObj == nil {
			if msg, ok := ev["message"].(map[string]any); ok {
				usageObj = msg["usage"]
			}
		}
		if u := ompUsageEvent(usageObj, at, cumulative); u != nil {
			out = append(out, *u)
		}
	case "error":
		errMsg := firstNonEmpty(ompErrorText(ev["error"]), mapStr(ev, "message"), mapStr(ev, "text"))
		out = append(out, Event{Kind: EvError, At: at, Text: clipText(errMsg)})
	}

	return out
}

// StreamLabel returns a concise human-readable office-view label for an omp --mode json line.
func (ompAdapter) StreamLabel(line string) string {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "{") {
		return ""
	}
	var ev map[string]any
	if json.Unmarshal([]byte(trimmed), &ev) != nil {
		return ""
	}
	switch mapStr(ev, "type") {
	case "tool_execution_start", "tool_call", "tool_start":
		name := firstNonEmpty(mapStr(ev, "toolName"), mapStr(ev, "name"), mapStr(ev, "tool"))
		args, _ := ev["args"].(map[string]any)
		if args == nil {
			args, _ = ev["input"].(map[string]any)
		}
		return ompToolLabel(name, args)
	case "assistant", "message_end":
		msg, _ := ev["message"].(map[string]any)
		if msg == nil {
			msg = ev
		}
		content, _ := msg["content"].([]any)
		label := ""
		for _, c := range content {
			block, _ := c.(map[string]any)
			bt := mapStr(block, "type")
			if bt != "toolCall" && bt != "tool_use" {
				continue
			}
			name := firstNonEmpty(mapStr(block, "name"), mapStr(block, "toolName"))
			args, _ := block["arguments"].(map[string]any)
			if args == nil {
				args, _ = block["input"].(map[string]any)
			}
			label = ompToolLabel(name, args)
		}
		return label
	case "turn_end", "agent_end", "result", "done":
		return "Finishing"
	case "error":
		return "Error"
	default:
		return ""
	}
}

// StreamModel extracts the resolved upstream provider/model identifier from an omp --mode json
// stream line for attestation (observed_models).
func (ompAdapter) StreamModel(line string) string {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "{") {
		return ""
	}
	var ev map[string]any
	if json.Unmarshal([]byte(trimmed), &ev) != nil || mapStr(ev, "type") == "" {
		return ""
	}

	provider := mapStr(ev, "provider")
	model := ""
	switch m := ev["model"].(type) {
	case string:
		model = m
	case map[string]any:
		if provider == "" {
			provider = mapStr(m, "provider")
		}
		model = firstNonEmpty(mapStr(m, "id"), mapStr(m, "model"), mapStr(m, "name"))
	}

	if model == "" {
		if msg, ok := ev["message"].(map[string]any); ok {
			if provider == "" {
				provider = mapStr(msg, "provider")
			}
			switch mm := msg["model"].(type) {
			case string:
				model = mm
			case map[string]any:
				if provider == "" {
					provider = mapStr(mm, "provider")
				}
				model = firstNonEmpty(mapStr(mm, "id"), mapStr(mm, "model"), mapStr(mm, "name"))
			}
		}
	}

	model = strings.TrimSpace(model)
	provider = strings.TrimSpace(provider)
	if model == "" {
		return ""
	}
	if provider != "" && !strings.Contains(model, "/") {
		model = provider + "/" + model
	}
	model = modelChars.ReplaceAllString(model, "")
	if len(model) > 200 {
		model = model[:200]
	}
	return model
}

// OmpVendorFamily maps an omp-reported provider/model identifier (or bare model ID)
// to its canonical vendor family. Unknown or empty values return "" (fail-closed)
// so unverified providers never count as an independent checker family.
func OmpVendorFamily(model string) string {
	low := strings.ToLower(strings.TrimSpace(model))
	if low == "" {
		return ""
	}
	if provider, rest, hasSlash := strings.Cut(low, "/"); hasSlash {
		if strings.TrimSpace(rest) == "" {
			return ""
		}
		switch provider {
		case "anthropic", "claude":
			return "anthropic"
		case "openai", "openai-codex", "codex":
			return "openai"
		case "xai", "grok":
			return "xai"
		case "google", "gemini", "google-gemini", "google-antigravity":
			return "google"
		case "deepseek":
			return "deepseek"
		case "mistral":
			return "mistral"
		case "ollama", "lm-studio", "lmstudio", "llama.cpp", "llamacpp", "vllm", "local":
			return "local"
		default:
			return ""
		}
	}
	switch {
	case strings.HasPrefix(low, "claude-"):
		return "anthropic"
	case strings.HasPrefix(low, "gpt-"),
		strings.HasPrefix(low, "o1-"), low == "o1",
		strings.HasPrefix(low, "o3-"), low == "o3",
		strings.HasPrefix(low, "o4-"), low == "o4",
		strings.HasPrefix(low, "codex"):
		return "openai"
	case strings.HasPrefix(low, "grok-"):
		return "xai"
	case strings.HasPrefix(low, "gemini-"):
		return "google"
	case strings.HasPrefix(low, "deepseek-"):
		return "deepseek"
	case strings.HasPrefix(low, "mistral-"),
		strings.HasPrefix(low, "codestral-"),
		strings.HasPrefix(low, "devstral-"):
		return "mistral"
	default:
		return ""
	}
}

func mapStr(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func mapBool(m map[string]any, key string) bool {
	if m == nil {
		return false
	}
	v, _ := m[key].(bool)
	return v
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func ompErrorText(v any) string {
	switch e := v.(type) {
	case string:
		return strings.TrimSpace(e)
	case map[string]any:
		return strings.TrimSpace(firstNonEmpty(mapStr(e, "message"), mapStr(e, "error"), mapStr(e, "text")))
	default:
		return ""
	}
}

func ompMessageUpdateText(ev map[string]any) string {
	if ame, ok := ev["assistantMessageEvent"].(map[string]any); ok {
		if mapStr(ame, "type") == "text_delta" || mapStr(ame, "delta") != "" {
			return firstNonEmpty(mapStr(ame, "delta"), mapStr(ame, "text"))
		}
	}
	return firstNonEmpty(mapStr(ev, "delta"), mapStr(ev, "text"))
}

func ompContentEvents(content any, at string) []Event {
	blocks, _ := content.([]any)
	var out []Event
	for _, item := range blocks {
		block, _ := item.(map[string]any)
		switch mapStr(block, "type") {
		case "text":
			if t := clipText(mapStr(block, "text")); t != "" {
				out = append(out, Event{Kind: EvMessage, At: at, Text: t})
			}
		case "toolCall", "tool_use":
			name := firstNonEmpty(mapStr(block, "name"), mapStr(block, "toolName"))
			callID := firstNonEmpty(mapStr(block, "id"), mapStr(block, "toolCallId"))
			args, _ := block["arguments"].(map[string]any)
			if args == nil {
				args, _ = block["input"].(map[string]any)
			}
			rawInput := block["arguments"]
			if rawInput == nil {
				rawInput = block["input"]
			}
			out = append(out, Event{
				Kind:        EvToolStart,
				At:          at,
				Tool:        token(name, 60),
				Summary:     ompToolLabel(name, args),
				InputDigest: digestOf(rawInput),
				CallID:      token(callID, 80),
			})
		}
	}
	return out
}

func ompUsageEvent(raw any, at string, cumulative bool) *Event {
	usage, ok := raw.(map[string]any)
	if !ok || usage == nil {
		return nil
	}
	num := func(keys ...string) *int {
		for _, k := range keys {
			if v, ok := usage[k].(float64); ok {
				n := int(v)
				return &n
			}
		}
		return nil
	}
	in := num("input_tokens", "input", "prompt_tokens")
	out := num("output_tokens", "output", "completion_tokens")
	cached := num("cache_read_input_tokens", "cached_input_tokens", "cacheRead")
	if in == nil && out == nil && cached == nil {
		return nil
	}
	return &Event{
		Kind:         EvUsage,
		At:           at,
		InputTokens:  in,
		OutputTokens: out,
		CachedTokens: cached,
		Cumulative:   cumulative,
	}
}

func ompToolLabel(name string, args map[string]any) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "read":
		p := firstNonEmpty(mapStr(args, "path"), mapStr(args, "file_path"))
		return clip("Read: " + base(p))
	case "write", "edit", "multiedit", "patch":
		p := firstNonEmpty(mapStr(args, "path"), mapStr(args, "file_path"))
		return clip("Edit: " + base(p))
	case "bash", "shell", "exec":
		return clip("Run: " + firstWord(mapStr(args, "command")))
	case "grep", "find", "glob", "ls":
		return "Search files"
	case "fetch", "webfetch":
		return clip("Fetch: " + host(mapStr(args, "url")))
	case "websearch", "search":
		return "Search"
	default:
		return toolLabel(name, args)
	}
}

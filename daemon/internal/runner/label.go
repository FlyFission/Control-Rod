package runner

import (
	"encoding/json"
	"net/url"
	"path"
	"regexp"
	"strings"
)

// MaxLabel is the longest label the office view shows.
const MaxLabel = 120

var tokenChars = regexp.MustCompile(`[^A-Za-z0-9._-]`)

// token keeps only a short run of plain characters, so a label never carries model prose.
func token(s string, n int) string {
	s = tokenChars.ReplaceAllString(s, "")
	if len(s) > n {
		s = s[:n]
	}
	return s
}

func clip(s string) string {
	if len(s) > MaxLabel {
		return s[:MaxLabel]
	}
	return s
}

func base(p string) string {
	if p == "" {
		return ""
	}
	return token(path.Base(strings.ReplaceAll(p, "\\", "/")), 80)
}

func firstWord(cmd string) string {
	f := strings.Fields(cmd)
	if len(f) == 0 {
		return ""
	}
	return token(path.Base(f[0]), 40)
}

func host(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return token(u.Hostname(), 80)
}

// toolLabel maps a tool call to a label built only from the tool name and plain tokens taken
// from its arguments (a file basename, a host, a command's first word).
func toolLabel(name string, input map[string]any) string {
	str := func(k string) string {
		v, _ := input[k].(string)
		return v
	}
	switch name {
	case "Write", "Edit", "MultiEdit", "NotebookEdit":
		p := str("file_path")
		if p == "" {
			p = str("notebook_path")
		}
		return clip("Edit: " + base(p))
	case "Read":
		return clip("Read: " + base(str("file_path")))
	case "Bash":
		return clip("Run: " + firstWord(str("command")))
	case "WebFetch":
		return clip("Fetch: " + host(str("url")))
	case "WebSearch":
		return "Search"
	case "Glob", "Grep":
		return "Search files"
	case "TodoWrite":
		return "Planning"
	default:
		return clip("Tool: " + token(name, 60))
	}
}

// LabelFor derives a label from one stream-json line, or "" when the line carries no event the
// office view shows. It understands Claude Code stream-json and Codex --json events.
func LabelFor(line string) string {
	var ev map[string]any
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		return ""
	}
	typ, _ := ev["type"].(string)
	switch typ {
	case "result":
		return "Finishing"
	case "assistant":
		msg, _ := ev["message"].(map[string]any)
		content, _ := msg["content"].([]any)
		label := ""
		for _, c := range content {
			block, _ := c.(map[string]any)
			if t, _ := block["type"].(string); t != "tool_use" {
				continue
			}
			name, _ := block["name"].(string)
			input, _ := block["input"].(map[string]any)
			label = toolLabel(name, input)
		}
		return label
	case "item.started", "item.completed":
		item, _ := ev["item"].(map[string]any)
		switch it, _ := item["type"].(string); it {
		case "command_execution":
			cmd, _ := item["command"].(string)
			return clip("Run: " + firstWord(cmd))
		case "file_change":
			changes, _ := item["changes"].([]any)
			for _, c := range changes {
				ch, _ := c.(map[string]any)
				p, _ := ch["path"].(string)
				return clip("Edit: " + base(p))
			}
			return "Edit"
		case "web_search":
			return "Search"
		}
	case "turn.completed":
		return "Finishing"
	}
	return ""
}

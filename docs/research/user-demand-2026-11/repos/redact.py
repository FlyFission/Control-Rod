"""Redact email addresses and home-folder user names from captured titles before they are committed.
Emails become [email]; /Users/<name>, /home/<name> and C:\\Users\\<name> keep the folder and become [user].
A name that already starts with "[" (such as [user] or a placeholder like [username]) is left alone, so
redact(redact(x)) == redact(x). Run this file to self-test."""
import re
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HOME = re.compile(r"(/Users/|/home/|[A-Za-z]:\\\\Users\\\\|[A-Za-z]:\\Users\\)(?!\[)([^/\\\s'\"`)\]\[]+)")
def redact(title: str) -> str:
    return HOME.sub(lambda m: m.group(1) + "[user]", EMAIL.sub("[email]", title))

if __name__ == "__main__":
    cases = {
        "mail bob@example.com now": "mail [email] now",
        "path /Users/alice/x": "path /Users/[user]/x",
        "path /home/bob/.config": "path /home/[user]/.config",
        "win C:\\Users\\carol\\AGENTS.md": "win C:\\Users\\[user]\\AGENTS.md",
        "json C:\\\\Users\\\\dan\\\\x": "json C:\\\\Users\\\\[user]\\\\x",
        "placeholder /Users/[username]/.paperclip": "placeholder /Users/[username]/.paperclip",
        "ellipsis /Users/...": "ellipsis /Users/[user]",
    }
    for raw, want in cases.items():
        once = redact(raw)
        assert once == want, (raw, once)
        assert redact(once) == once, ("not idempotent", raw)
    print(f"redact self-test passed ({len(cases)} cases, each idempotent)")

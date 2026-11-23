"""Redact email addresses and home-folder user names from captured titles before they are committed.
Emails become [email]; /Users/<name>, /home/<name> and C:\\Users\\<name> keep the folder and become [user]."""
import re
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HOME = re.compile(r"(/Users/|/home/|[A-Za-z]:\\\\Users\\\\|[A-Za-z]:\\Users\\)([^/\\\s'\"`)\]]+)")
def redact(title: str) -> str:
    return HOME.sub(lambda m: m.group(1) + "[user]", EMAIL.sub("[email]", title))

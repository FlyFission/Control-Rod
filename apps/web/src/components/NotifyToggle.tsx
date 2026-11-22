import { useEffect, useState } from "react";
import { NOTIFY_CHOICE_EVENT, type NotifySupport, notifySupport, readNotifyChoice, writeNotifyChoice } from "../lib/attention.js";

/**
 * The opt-in for browser notifications (pattern AW2). Off until the person turns it on; the browser
 * is asked for permission only from this button, never on page load. The choice is per person on
 * this browser, like the Inbox's "since you last looked" cursor.
 */
export function NotifyToggle({ user }: { user: string | undefined }) {
  const [support, setSupport] = useState<NotifySupport>(notifySupport);
  const [chosen, setChosen] = useState(() => readNotifyChoice(user));
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const sync = () => {
      setChosen(readNotifyChoice(user));
      setSupport(notifySupport());
    };
    sync();
    window.addEventListener(NOTIFY_CHOICE_EVENT, sync);
    return () => window.removeEventListener(NOTIFY_CHOICE_EVENT, sync);
  }, [user]);

  if (support === "unsupported" || user === undefined) return null;

  async function turnOn() {
    setAsking(true);
    try {
      const answer = support === "granted" ? "granted" : await window.Notification.requestPermission();
      setSupport(answer);
      if (answer === "granted") writeNotifyChoice(user, true);
    } catch {
      setSupport(notifySupport());
    } finally {
      setAsking(false);
    }
  }

  if (support === "denied") {
    return <p className="notify-toggle muted small">Notifications are blocked for this site in the browser's settings.</p>;
  }
  if (chosen && support === "granted") {
    return (
      <p className="notify-toggle small">
        <span className="muted">This browser notifies you when something new waits on you while the tab is hidden.</span>{" "}
        <button type="button" className="btn small" onClick={() => writeNotifyChoice(user, false)}>
          Turn off notifications
        </button>
      </p>
    );
  }
  return (
    <p className="notify-toggle small">
      <button type="button" className="btn small" disabled={asking} onClick={() => void turnOn()}>
        Notify me in this browser
      </button>{" "}
      <span className="muted">Only for new items that wait on you, and only while this tab is hidden.</span>
    </p>
  );
}

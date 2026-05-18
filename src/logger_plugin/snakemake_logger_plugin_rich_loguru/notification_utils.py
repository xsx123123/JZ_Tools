import urllib.request
import json
import sys
import threading
from typing import Optional


def send_webhook_notification(
    url: str, 
    message: str, 
    title: str = "Snakemake Notification",
    platform: str = "dingtalk"
):
    """
    Send a notification to a webhook (DingTalk, Feishu, etc.)
    """
    def _send():
        try:
            payload = {}
            if platform == "dingtalk":
                payload = {
                    "msgtype": "markdown",
                    "markdown": {
                        "title": title,
                        "text": f"### {title}\n\n{message}"
                    }
                }
            elif platform == "feishu":
                payload = {
                    "msg_type": "interactive",
                    "card": {
                        "header": {
                            "title": {
                                "tag": "plain_text",
                                "content": title
                            }
                        },
                        "elements": [
                            {
                                "tag": "markdown",
                                "content": message
                            }
                        ]
                    }
                }
            else:
                # Generic fallback
                payload = {"text": f"{title}\n{message}"}

            json_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=json_data, method="POST")
            req.add_header("Content-Type", "application/json")
            
            with urllib.request.urlopen(req, timeout=10) as response:
                pass
        except Exception as e:
            print(f"[Notification] Failed to send to {platform}: {e}", file=sys.stderr)

    # Always send in background
    t = threading.Thread(target=_send, daemon=True)
    t.start()

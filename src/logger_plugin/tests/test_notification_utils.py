import pytest
from unittest.mock import patch, MagicMock
from snakemake_logger_plugin_rich_loguru.notification_utils import send_webhook_notification
import json
import time

@patch("urllib.request.urlopen")
@patch("urllib.request.Request")
def test_send_webhook_dingtalk(mock_request, mock_urlopen):
    # Setup mock
    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response
    
    url = "http://mock-dingtalk.com"
    message = "Test Message"
    
    send_webhook_notification(url, message, platform="dingtalk")
    
    # Wait a bit for the thread to finish
    time.sleep(0.5)
    
    # Verify Request was called
    mock_request.assert_called_once()
    args, kwargs = mock_request.call_args
    assert args[0] == url
    
    # Check payload
    payload = json.loads(kwargs["data"].decode("utf-8"))
    assert payload["msgtype"] == "markdown"
    assert "Test Message" in payload["markdown"]["text"]

@patch("urllib.request.urlopen")
@patch("urllib.request.Request")
def test_send_webhook_feishu(mock_request, mock_urlopen):
    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response
    
    url = "http://mock-feishu.com"
    message = "Test Message"
    
    send_webhook_notification(url, message, platform="feishu")
    
    time.sleep(0.5)
    
    mock_request.assert_called_once()
    args, kwargs = mock_request.call_args
    payload = json.loads(kwargs["data"].decode("utf-8"))
    assert payload["msg_type"] == "interactive"
    assert "Test Message" in payload["card"]["elements"][0]["content"]

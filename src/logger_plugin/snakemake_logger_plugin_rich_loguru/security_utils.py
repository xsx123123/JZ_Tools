"""
Security utilities for OmicHub monitor payload protection.

Provides:
- Timestamp / nonce generation
- HMAC-SHA256 request signing
- AES-256-GCM payload encryption
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from typing import Optional


def generate_timestamp() -> str:
    """Return current UTC time in ISO8601 format with Z suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_nonce() -> str:
    """Return a random nonce as a hex string."""
    return secrets.token_hex(16)


def sign_request(
    body: bytes,
    signing_key: str,
    timestamp: str,
    nonce: str,
) -> str:
    """
    Create an HMAC-SHA256 signature for an HTTP request.

    Signature content:
        timestamp + "\\n" + nonce + "\\n" + sha256(request_body)

    Returns a string in the form ``v1=<hex>``.
    """
    body_hash = hashlib.sha256(body).hexdigest()
    signature_content = f"{timestamp}\n{nonce}\n{body_hash}"
    signature = hmac.new(
        signing_key.encode("utf-8"),
        signature_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"v1={signature}"


def decode_encryption_key(key_b64: str) -> bytes:
    """
    Decode a base64-encoded 32-byte AES key.

    Raises:
        ValueError: if the key is not valid base64 or not exactly 32 bytes.
    """
    try:
        key = base64.b64decode(key_b64, validate=True)
    except Exception as exc:
        raise ValueError("encryption key is not valid base64") from exc
    if len(key) != 32:
        raise ValueError(f"encryption key must be 32 bytes, got {len(key)}")
    return key


def encrypt_payload(
    plaintext: bytes,
    encryption_key: str,
    timestamp: Optional[str] = None,
) -> dict:
    """
    Encrypt a plaintext payload with AES-256-GCM.

    Args:
        plaintext: Raw JSON bytes to encrypt.
        encryption_key: Base64-encoded 32-byte AES key.
        timestamp: Optional ISO8601 timestamp; defaults to now.

    Returns:
        A dict representing the OmicHub encryption envelope:
        {
          "schema_version": "omichub.monitor.envelope.v1",
          "alg": "A256GCM",
          "kid": "default",
          "nonce": "<base64>",
          "ciphertext": "<base64>",
          "timestamp": "<ISO8601>"
        }
    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise ImportError(
            "cryptography is required for payload encryption; "
            "install with `pip install cryptography`"
        ) from exc

    key = decode_encryption_key(encryption_key)
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    return {
        "schema_version": "omichub.monitor.envelope.v1",
        "alg": "A256GCM",
        "kid": "default",
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        "timestamp": timestamp or generate_timestamp(),
    }


def decrypt_payload(envelope: dict, encryption_key: str) -> bytes:
    """
    Decrypt an AES-256-GCM envelope (primarily for tests/validation).

    Raises:
        ValueError: on invalid key or envelope format.
    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise ImportError(
            "cryptography is required for payload decryption"
        ) from exc

    if envelope.get("alg") != "A256GCM":
        raise ValueError("unsupported encryption algorithm")

    key = decode_encryption_key(encryption_key)
    try:
        nonce = base64.b64decode(envelope["nonce"], validate=True)
        ciphertext = base64.b64decode(envelope["ciphertext"], validate=True)
    except Exception as exc:
        raise ValueError("invalid base64 in envelope") from exc

    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)

import base64
import hashlib
import hmac
import os
import re

import pytest

from snakemake_logger_plugin_rich_loguru.security_utils import (
    decrypt_payload,
    encrypt_payload,
    generate_nonce,
    generate_timestamp,
    sign_request,
)


def test_generate_timestamp_format():
    ts = generate_timestamp()
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", ts)


def test_generate_nonce_unique():
    nonce1 = generate_nonce()
    nonce2 = generate_nonce()
    assert nonce1 != nonce2
    assert len(nonce1) >= 16


def test_sign_request_consistency():
    body = b'{"hello": "world"}'
    key = "super-secret-key"
    ts = "2026-07-10T12:00:00Z"
    nonce = "abc123"

    sig1 = sign_request(body, key, ts, nonce)
    sig2 = sign_request(body, key, ts, nonce)
    assert sig1 == sig2
    assert sig1.startswith("v1=")

    body_hash = hashlib.sha256(body).hexdigest()
    expected = hmac.new(
        key.encode("utf-8"),
        f"{ts}\n{nonce}\n{body_hash}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    assert sig1 == f"v1={expected}"


def test_sign_request_different_bodies_differ():
    key = "super-secret-key"
    ts = "2026-07-10T12:00:00Z"
    nonce = "abc123"
    assert sign_request(b"a", key, ts, nonce) != sign_request(b"b", key, ts, nonce)


def test_encrypt_decrypt_roundtrip():
    key = base64.b64encode(os.urandom(32)).decode("ascii")
    plaintext = b'{"task_id": "uuid", "secret": "data"}'
    envelope = encrypt_payload(plaintext, key)

    assert envelope["schema_version"] == "omichub.monitor.envelope.v1"
    assert envelope["alg"] == "A256GCM"
    assert envelope["kid"] == "default"
    assert "nonce" in envelope
    assert "ciphertext" in envelope
    assert "timestamp" in envelope

    decrypted = decrypt_payload(envelope, key)
    assert decrypted == plaintext


def test_decrypt_with_wrong_key_fails():
    key1 = base64.b64encode(os.urandom(32)).decode("ascii")
    key2 = base64.b64encode(os.urandom(32)).decode("ascii")
    envelope = encrypt_payload(b"secret", key1)
    with pytest.raises(Exception):
        decrypt_payload(envelope, key2)


def test_encryption_key_length_validation():
    from snakemake_logger_plugin_rich_loguru.security_utils import decode_encryption_key

    valid = base64.b64encode(os.urandom(32)).decode("ascii")
    assert len(decode_encryption_key(valid)) == 32

    short = base64.b64encode(os.urandom(16)).decode("ascii")
    with pytest.raises(ValueError):
        decode_encryption_key(short)

    with pytest.raises(ValueError):
        decode_encryption_key("not-valid-base64!!!")

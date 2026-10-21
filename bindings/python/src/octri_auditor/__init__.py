"""Stateless native transport. All audit semantics execute in Rust."""

from __future__ import annotations

import ctypes
from . import _json as exact_json
from pathlib import Path
from typing import Any, Dict, Union

JsonObject = Dict[str, Any]


class AuditError(Exception):
    def __init__(self, error: JsonObject):
        super().__init__(error["message"])
        self.code = error["code"]
        self.diagnostics = error.get("diagnostics", [])


class Auditor:
    """Calls block the current thread. Each call owns independent Rust state."""

    def __init__(self, library: Union[str, Path]):
        self._library = ctypes.CDLL(str(Path(library).resolve(strict=True)))
        version = self._library.octri_auditor_abi_version
        version.restype = ctypes.c_uint32
        if version() != 1:
            raise RuntimeError("Expected auditor ABI version 1")
        self._call = self._library.octri_auditor_call
        self._call.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        self._call.restype = ctypes.c_void_p
        self._data = self._library.octri_auditor_buffer_data
        self._data.argtypes = [ctypes.c_void_p]
        self._data.restype = ctypes.c_void_p
        self._length = self._library.octri_auditor_buffer_len
        self._length.argtypes = [ctypes.c_void_p]
        self._length.restype = ctypes.c_size_t
        self._free = self._library.octri_auditor_buffer_free
        self._free.argtypes = [ctypes.c_void_p]
        self._free.restype = None

    def call(self, envelope: JsonObject) -> JsonObject:
        data = exact_json.dumps(envelope).encode("utf-8")
        if len(data) > 128 * 1024 * 1024:
            raise ValueError("Auditor envelope exceeds 128 MiB")
        borrowed = ctypes.create_string_buffer(data)
        output = self._call(borrowed, len(data))
        if not output:
            raise MemoryError("Native auditor returned a null buffer")
        try:
            result = ctypes.string_at(self._data(output), self._length(output))
        finally:
            self._free(output)
        return exact_json.loads(result)

    def _result(self, action: str, **fields: Any) -> Any:
        result = self.call({"abiVersion": 1, "action": action, **fields})
        if "Err" in result:
            raise AuditError(result["Err"])
        if "Ok" not in result:
            raise RuntimeError("Invalid auditor response envelope")
        return result["Ok"]

    def audit(self, request: JsonObject) -> JsonObject:
        return self._result("audit", request=request)

    def fix(self, request: JsonObject) -> JsonObject:
        return self._result("fix", request=request)

    def bundle(self, request: JsonObject) -> JsonObject:
        return self._result("bundle", request=request)

    def compare(self, before: JsonObject, after: JsonObject) -> JsonObject:
        return self._result("compare", before=before, after=after)

    def export(self, report: JsonObject, format: str = "json") -> Any:
        return self._result("export", report=report, format=format)

    def rules(self) -> list:
        return self._result("rules")


def text(content: str, uri: str = "memory://audit/openapi.yaml") -> JsonObject:
    return {"uri": uri, "content": content, "generated": False}


def document(value: JsonObject, uri: str = "memory://audit/openapi.json") -> JsonObject:
    return {"uri": uri, "content": exact_json.dumps(value), "generated": True}

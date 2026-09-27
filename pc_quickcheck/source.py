# -*- coding: utf-8 -*-
"""Nguồn dữ liệu cho các bộ phân tích.

LiveSource   : chạy truy vấn thật trên máy Windows và GHI LẠI mọi kết quả (snapshot).
ReplaySource : đọc lại snapshot (từ gói QA) để phân tích offline trên máy khác.
Các bộ phân tích chỉ gọi src.ps(...), src.events(...), src.probe(...) nên không cần
biết dữ liệu đến từ đâu.
"""
import datetime as _dt
import json
import platform

from . import VERSION, queries


class _Base:
    def __init__(self, days=30):
        self.days = days
        self.record = {}
        self.errors = {}
        self.meta = {}

    def _get(self, key, thunk):
        raise NotImplementedError

    def ps(self, name):
        from . import probes
        return self._get("ps:" + name, lambda: probes.run_ps_json(queries.PS[name]))

    def events(self, group):
        from . import probes
        return self._get(f"ev:{group}", lambda: probes.run_ps_json(queries.event_script(group, self.days)))

    def probe(self, name, *args):
        from . import probes
        key = "probe:" + name + ("" if not args else ":" + "|".join(str(a) for a in args))
        return self._get(key, lambda: probes.PROBES[name](*args))

    def snapshot(self):
        return {"format": "pc_quickcheck.snapshot/1", "meta": self.meta, "record": self.record,
                "errors": self.errors}


class LiveSource(_Base):
    def __init__(self, days=30, use_dxdiag=True, progress=None):
        super().__init__(days)
        from . import probes
        self.use_dxdiag = use_dxdiag
        self.progress = progress
        self.meta = {"tool_version": VERSION, "created": _dt.datetime.now().isoformat(timespec="seconds"),
                     "is_admin": probes.is_admin(), "platform": platform.platform(), "days": days,
                     "smartctl": bool(probes.find_smartctl()), "mode": "live"}

    def _get(self, key, thunk):
        if key in self.record:
            return self.record[key]
        if self.progress:
            self.progress(key)
        try:
            val = thunk()
        except Exception as e:  # một truy vấn lỗi không được làm hỏng cả lượt kiểm tra
            val = None
            self.errors[key] = f"{type(e).__name__}: {e}"[:400]
        self.record[key] = val
        return val


class ReplaySource(_Base):
    def __init__(self, snapshot):
        super().__init__(snapshot.get("meta", {}).get("days", 30))
        self.record = snapshot.get("record", {})
        self.errors = snapshot.get("errors", {})
        self.meta = dict(snapshot.get("meta", {}))
        self.meta["mode"] = "replay"
        self.use_dxdiag = True

    def _get(self, key, thunk):
        return self.record.get(key)

    @classmethod
    def from_file(cls, path):
        with open(path, "r", encoding="utf-8") as fh:
            return cls(json.load(fh))

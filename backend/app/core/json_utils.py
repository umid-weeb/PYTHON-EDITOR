import json
from datetime import date, datetime

class ArenaJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

def arena_dumps(obj, **kwargs):
    kwargs.setdefault("ensure_ascii", False)
    kwargs.setdefault("cls", ArenaJSONEncoder)
    return json.dumps(obj, **kwargs)

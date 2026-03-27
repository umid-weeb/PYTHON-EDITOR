import urllib.request as r
import urllib.error as e
req = r.Request('https://python-editor-b87c.onrender.com/api/problems/balanced-brackets-lite-02')
try:
    r.urlopen(req)
except e.HTTPError as err:
    print("HTTPError:", err.code)
    print(err.read().decode('utf-8'))
except Exception as ex:
    print("Error:", ex)

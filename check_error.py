import urllib.request as r
import urllib.error as e
req = r.Request('http://16.16.26.138:5000')
try:
    r.urlopen(req)
except e.HTTPError as err:
    print("HTTPError:", err.code)
    print(err.read().decode('utf-8'))
except Exception as ex:
    print("Error:", ex)

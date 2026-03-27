import os

file_path = 'arena/src/context/ArenaContext.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add useEffect only if token exists
insertion = """  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      setShowAuthModal(false);
    }
  }, [token]);
"""

target = "  const cacheRef = useRef(new Map());"
if target in content:
    new_content = content.replace(target, target + "\n\n" + insertion)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated ArenaContext.jsx via script")
else:
    print("Target not found in ArenaContext.jsx")

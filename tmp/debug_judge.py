import ast
import json
import time

# Simulation of the harness + instrumenter
class LoopTimeoutError(Exception):
    pass

class ArenaSecurity:
    def __init__(self, time_limit=2.0, tick_limit=1_000_000):
        self.start_time = time.perf_counter()
        self.ticks = 0
        self.time_limit = time_limit
        self.tick_limit = tick_limit

    def tick(self):
        self.ticks += 1
        if self.ticks % 1000 == 0:
            if (time.perf_counter() - self.start_time) > self.time_limit:
                raise LoopTimeoutError(f"Time Limit Exceeded: {self.time_limit}s")
        if self.ticks > self.tick_limit:
            raise LoopTimeoutError("Infinite Loop Detected: Max iterations exceeded")

class LoopInstrumenter(ast.NodeTransformer):
    def visit_While(self, node):
        self.generic_visit(node)
        tick_call = ast.Expr(ast.Call(func=ast.Name(id='__arena_tick__', ctx=ast.Load()), args=[], keywords=[]))
        node.body.insert(0, tick_call)
        return node
    def visit_For(self, node):
        self.generic_visit(node)
        tick_call = ast.Expr(ast.Call(func=ast.Name(id='__arena_tick__', ctx=ast.Load()), args=[], keywords=[]))
        node.body.insert(0, tick_call)
        return node

# Test Code (from user screenshot)
user_code = """
class Solution:
    def solve(self, text):
        target = "salom"
        count = 0
        for i in text:
            if i.lower() in target:
                count += 1
        return count
"""

security_monitor = ArenaSecurity()

def test_instrumentation():
    tree = ast.parse(user_code)
    transformer = LoopInstrumenter()
    transformed_tree = transformer.visit(tree)
    ast.fix_missing_locations(transformed_tree)
    
    code_obj = compile(transformed_tree, filename="solution.py", mode="exec")
    
    # Simulate execution environment
    glbs = {
        "__arena_tick__": security_monitor.tick,
        "__name__": "__main__",
    }
    exec(code_obj, glbs)
    
    # Try calling the function
    sol = glbs["Solution"]()
    try:
        res = sol.solve("test text")
        print(f"Result: {res}")
    except Exception as e:
        print(f"Error during execution: {e}")

if __name__ == "__main__":
    test_instrumentation()
    

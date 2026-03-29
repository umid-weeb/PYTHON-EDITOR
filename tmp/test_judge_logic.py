import ast
import importlib.util
import sys
import io
import json
import pathlib
import time
import traceback

class LoopTimeoutError(Exception):
    pass

class ArenaSecurity:
    def __init__(self, time_limit=2.0, tick_limit=1000000):
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
        tick_call = ast.Expr(ast.Call(
            func=ast.Name(id='__arena_tick__', ctx=ast.Load()),
            args=[], keywords=[]
        ))
        node.body.insert(0, tick_call)
        return node

    def visit_For(self, node):
        self.generic_visit(node)
        tick_call = ast.Expr(ast.Call(
            func=ast.Name(id='__arena_tick__', ctx=ast.Load()),
            args=[], keywords=[]
        ))
        node.body.insert(0, tick_call)
        return node

def test_execution(code_str, function_name, args):
    security_monitor = ArenaSecurity()
    
    try:
        tree = ast.parse(code_str, filename="solution.py")
        transformer = LoopInstrumenter()
        transformed_tree = transformer.visit(tree)
        ast.fix_missing_locations(transformed_tree)
        
        # Debug: print transformed code
        # import astor
        # print(ast.unparse(transformed_tree))
        
        code_obj = compile(transformed_tree, filename="solution.py", mode="exec")
        
        # Simulation of module creation
        class DummyModule:
            pass
        module = DummyModule()
        module.__dict__ = {}
        module.__dict__['__arena_tick__'] = security_monitor.tick
        
        exec(code_obj, module.__dict__)
        
        if hasattr(module, "Solution"):
            sol_instance = getattr(module, "Solution")()
            target = getattr(sol_instance, function_name)
        else:
            target = module.__dict__.get(function_name)
            
        if not target:
            return {"verdict": "Runtime Error", "error": f"Function {function_name} not found"}
            
        result = target(*args)
        return {"verdict": "Accepted", "result": result}
        
    except Exception as e:
        return {"verdict": "Runtime Error", "error": str(e), "trace": traceback.format_exc()}

# Test Case 1: Simple loop
code1 = """
class Solution:
    def solve(self, n):
        res = 0
        for i in range(n):
            res += i
        return res
"""
print("Running Test 1 (Simple loop)...")
res1 = test_execution(code1, "solve", [5])
print(json.dumps(res1, indent=2))

# Test Case 2: Infinite loop
code2 = """
class Solution:
    def solve(self, n):
        while True:
            pass
"""
print("\nRunning Test 2 (Infinite loop)...")
res2 = test_execution(code2, "solve", [5])
print(json.dumps(res2, indent=2))

# Test Case 3: Error
code3 = """
class Solution:
    def solve(self, n):
        return 1 / 0
"""
print("\nRunning Test 3 (1/0 error)...")
res3 = test_execution(code3, "solve", [5])
print(json.dumps(res3, indent=2))

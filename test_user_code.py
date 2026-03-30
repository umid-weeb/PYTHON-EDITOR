import sys

class Solution:
    def solve(self, text):
        bank = 'salom'
        caunt=0
        for i in text:
            if i.lower() in bank:
                caunt+=1
        return caunt

if __name__ == "__main__":
    sol = Solution()
    test_input = "PPwwASfEOLTip KN j"
    result = sol.solve(test_input)
    print(f"Input: {test_input}")
    print(f"Result: {result}")
    print(f"Type of result: {type(result)}")

/**
 * C++ driver generator.
 *
 * Wraps the user's `class Solution` with a main() that reads all test cases
 * from stdin, parses each argument per the signature spec, calls the method,
 * captures the return value + the user's stdout, and prints one marked record
 * per case that the browser parses back into case results.
 *
 * stdin format:  <T>\n  then, for each case, one JSON-encoded value per line
 *                (K lines for K params).
 * stdout format: per case  \x1E <result-json> \x1F <base64 stdout> \x1F <base64 error> \n
 */

// Reusable C++ prelude: a tiny JSON parser, typed extractors, JSON serializers
// (overloaded `tj`), and base64 — all namespaced under `pz`.
const CPP_PRELUDE = String.raw`#include <bits/stdc++.h>
using namespace std;
namespace pz {
struct JVal { int t=0; bool b=false; double num=0; string str; vector<JVal> arr; };
struct JP {
  const string& s; size_t i=0; JP(const string& x):s(x){}
  void ws(){ while(i<s.size() && (s[i]==' '||s[i]=='\t'||s[i]=='\r'||s[i]=='\n')) i++; }
  JVal parse(){ ws(); return val(); }
  JVal val(){ ws(); if(i>=s.size()) return {}; char c=s[i];
    if(c=='[') return arr(); if(c=='"') return str();
    if(c=='t'||c=='f') return boolean(); if(c=='n'){ i+=4; return {}; } return num(); }
  JVal arr(){ JVal v; v.t=4; i++; ws(); if(i<s.size()&&s[i]==']'){i++;return v;}
    while(i<s.size()){ v.arr.push_back(val()); ws();
      if(i<s.size()&&s[i]==','){i++;continue;} if(i<s.size()&&s[i]==']'){i++;break;} break; } return v; }
  JVal str(){ JVal v; v.t=3; i++; string r; while(i<s.size()&&s[i]!='"'){ char c=s[i++];
      if(c=='\\'&&i<s.size()){ char e=s[i++]; if(e=='n')r+='\n'; else if(e=='t')r+='\t';
        else if(e=='r')r+='\r'; else if(e=='"')r+='"'; else if(e=='\\')r+='\\'; else if(e=='/')r+='/'; else r+=e; }
      else r+=c; } if(i<s.size())i++; v.str=r; return v; }
  JVal boolean(){ JVal v; v.t=1; if(s[i]=='t'){v.b=true;i+=4;} else {v.b=false;i+=5;} return v; }
  JVal num(){ JVal v; v.t=2; size_t j=i; while(j<s.size()&&(isdigit((unsigned char)s[j])||s[j]=='-'||s[j]=='+'||s[j]=='.'||s[j]=='e'||s[j]=='E'))j++;
    try{ v.num=stod(s.substr(i,j-i)); }catch(...){ v.num=0; } i=j; return v; }
};
JVal parseJson(const string& line){ JP p(line); return p.parse(); }
int asInt(const JVal&v){ return (int)llround(v.num); }
long long asLong(const JVal&v){ return (long long)llround(v.num); }
double asDouble(const JVal&v){ return v.num; }
bool asBool(const JVal&v){ return v.t==1? v.b : (v.num!=0); }
string asString(const JVal&v){ return v.str; }
vector<int> asVecInt(const JVal&v){ vector<int> r; for(auto&x:v.arr) r.push_back(asInt(x)); return r; }
vector<long long> asVecLong(const JVal&v){ vector<long long> r; for(auto&x:v.arr) r.push_back(asLong(x)); return r; }
vector<double> asVecDouble(const JVal&v){ vector<double> r; for(auto&x:v.arr) r.push_back(asDouble(x)); return r; }
vector<bool> asVecBool(const JVal&v){ vector<bool> r; for(auto&x:v.arr) r.push_back(asBool(x)); return r; }
vector<string> asVecString(const JVal&v){ vector<string> r; for(auto&x:v.arr) r.push_back(asString(x)); return r; }
vector<vector<int>> asVecVecInt(const JVal&v){ vector<vector<int>> r; for(auto&x:v.arr) r.push_back(asVecInt(x)); return r; }
vector<vector<string>> asVecVecString(const JVal&v){ vector<vector<string>> r; for(auto&x:v.arr) r.push_back(asVecString(x)); return r; }
string jesc(const string&s){ string r="\""; for(char c:s){ if(c=='"')r+="\\\""; else if(c=='\\')r+="\\\\";
  else if(c=='\n')r+="\\n"; else if(c=='\t')r+="\\t"; else if(c=='\r')r+="\\r"; else r+=c; } r+="\""; return r; }
string tj(int x){ return to_string(x); }
string tj(long x){ return to_string(x); }
string tj(long long x){ return to_string(x); }
string tj(unsigned x){ return to_string(x); }
string tj(size_t x){ return to_string((unsigned long long)x); }
string tj(double x){ ostringstream o; o<<x; return o.str(); }
string tj(bool x){ return x?"true":"false"; }
string tj(char x){ return jesc(string(1,x)); }
string tj(const string&x){ return jesc(x); }
string tj(const char*x){ return jesc(string(x)); }
template<class T> string tj(const vector<T>&v){ string r="["; for(size_t k=0;k<v.size();k++){ if(k)r+=","; r+=tj(v[k]); } r+="]"; return r; }
string b64(const string&in){ static const char* T="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  string o; int val=0,bits=-6; for(unsigned char c:in){ val=(val<<8)+c; bits+=8;
    while(bits>=0){ o.push_back(T[(val>>bits)&0x3F]); bits-=6; } }
  if(bits>-6) o.push_back(T[((val<<8)>>(bits+8))&0x3F]); while(o.size()%4) o.push_back('='); return o; }
} // namespace pz
`;

// abstract type -> { decl: C++ variable type, extract: pz:: extractor }
function cppTypeInfo(rawType) {
  const t = String(rawType || "int").trim().toLowerCase().replace(/\s+/g, "");
  const map = {
    "int": ["int", "asInt"],
    "integer": ["int", "asInt"],
    "long": ["long long", "asLong"],
    "float": ["double", "asDouble"],
    "double": ["double", "asDouble"],
    "bool": ["bool", "asBool"],
    "boolean": ["bool", "asBool"],
    "char": ["string", "asString"],
    "string": ["string", "asString"],
    "int[]": ["vector<int>", "asVecInt"],
    "long[]": ["vector<long long>", "asVecLong"],
    "float[]": ["vector<double>", "asVecDouble"],
    "double[]": ["vector<double>", "asVecDouble"],
    "bool[]": ["vector<bool>", "asVecBool"],
    "string[]": ["vector<string>", "asVecString"],
    "int[][]": ["vector<vector<int>>", "asVecVecInt"],
    "string[][]": ["vector<vector<string>>", "asVecVecString"],
  };
  return map[t] || ["string", "asString"];
}

function normSpec(spec) {
  const fn = String(spec?.function_name || "solve").trim();
  const params = (spec?.params || []).map((p, i) => ({
    name: String(p?.name || `arg${i}`),
    type: String(p?.type || "int"),
  }));
  const returns = spec?.returns || {};
  const ret = String((typeof returns === "object" ? returns.type : returns) || "void");
  return { fn, params, ret };
}

export function generateCppSource(signature, userCode) {
  const { fn, params, ret } = normSpec(signature);

  const reads = params
    .map((p, i) => {
      const [decl, extract] = cppTypeInfo(p.type);
      return `    string __l${i}; getline(cin, __l${i}); ${decl} arg${i} = pz::${extract}(pz::parseJson(__l${i}));`;
    })
    .join("\n");
  const argList = params.map((_, i) => `arg${i}`).join(", ");

  const isVoid = ret.toLowerCase() === "void";
  const callBlock = isVoid
    ? `      Solution __sol; __sol.${fn}(${argList}); __res = "null";`
    : `      Solution __sol; auto __r = __sol.${fn}(${argList}); __res = pz::tj(__r);`;

  const main = `int main(){
  int T; { string __t; if(!getline(cin, __t)) return 0; try{ T = stoi(__t); }catch(...){ return 0; } }
  for(int __tc=0; __tc<T; __tc++){
${reads}
    ostringstream __cap; streambuf* __old = cout.rdbuf(__cap.rdbuf());
    string __res = "null"; string __err = "";
    try {
${callBlock}
    } catch(exception& __e){ __err = __e.what(); } catch(...){ __err = "runtime error"; }
    cout.rdbuf(__old);
    cout << "\\x1E" << __res << "\\x1F" << pz::b64(__cap.str()) << "\\x1F" << pz::b64(__err) << "\\n";
  }
  return 0;
}`;

  return `${CPP_PRELUDE}\n${userCode}\n\n${main}\n`;
}

// Build the stdin payload: count + one JSON value per line per case.
export function buildStdin(cases) {
  const lines = [String((cases || []).length)];
  for (const c of cases || []) {
    lines.push(String(c.input ?? "").replace(/\s+$/, ""));
  }
  return lines.join("\n") + "\n";
}

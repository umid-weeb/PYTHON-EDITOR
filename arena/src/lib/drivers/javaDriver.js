/**
 * Java driver generator (runs on Godbolt via the same cloud path as C++).
 *
 * Wraps the user's (package-private) `class Solution` and adds a `class Main`
 * with a main() that reads all test cases from stdin, parses each argument per
 * the signature spec, calls the method, captures the return + stdout, and prints
 * one marked record per case. Godbolt runs the class that has main(); the user's
 * class stays non-public so the file name doesn't matter.
 */

// Static helpers inside class Main: a tiny JSON parser + typed extractors +
// JSON serializers (overloaded `tj`) + base64. String.raw keeps backslashes.
const JAVA_HELPERS = String.raw`  static int P; static String S;
  static void ws(){ while(P<S.length() && Character.isWhitespace(S.charAt(P))) P++; }
  static Object val(){ ws(); if(P>=S.length()) return null; char c=S.charAt(P);
    if(c=='[') return arr(); if(c=='"') return str();
    if(c=='t'||c=='f') return bool(); if(c=='n'){ P+=4; return null; } return num(); }
  static List<Object> arr(){ List<Object> r=new ArrayList<>(); P++; ws(); if(P<S.length()&&S.charAt(P)==']'){P++;return r;}
    while(P<S.length()){ r.add(val()); ws(); if(P<S.length()&&S.charAt(P)==','){P++;continue;} if(P<S.length()&&S.charAt(P)==']'){P++;break;} break; } return r; }
  static String str(){ P++; StringBuilder b=new StringBuilder(); while(P<S.length()&&S.charAt(P)!='"'){ char c=S.charAt(P++);
    if(c=='\\' && P<S.length()){ char e=S.charAt(P++); if(e=='n')b.append('\n'); else if(e=='t')b.append('\t'); else if(e=='r')b.append('\r'); else if(e=='"')b.append('"'); else if(e=='\\')b.append('\\'); else if(e=='/')b.append('/'); else b.append(e); } else b.append(c); } if(P<S.length())P++; return b.toString(); }
  static Boolean bool(){ if(S.charAt(P)=='t'){P+=4;return true;} else {P+=5;return false;} }
  static Double num(){ int j=P; while(j<S.length() && (Character.isDigit(S.charAt(j)) || "+-.eE".indexOf(S.charAt(j))>=0)) j++; double d=0; try{ d=Double.parseDouble(S.substring(P,j)); }catch(Exception e){} P=j; return d; }
  static Object parseJson(String line){ S=(line==null?"":line); P=0; return val(); }
  static String readStr(String line){ String s=(line==null?"":line).trim(); if(!s.isEmpty() && s.charAt(0)=='"'){ Object o=parseJson(s); if(o instanceof String) return (String)o; } return s; }
  static int asInt(Object o){ return o instanceof Double ? (int)Math.round((Double)o) : (o instanceof Boolean ? (((Boolean)o)?1:0) : 0); }
  static long asLong(Object o){ return o instanceof Double ? Math.round((Double)o) : 0; }
  static double asDouble(Object o){ return o instanceof Double ? (Double)o : 0; }
  static boolean asBool(Object o){ return o instanceof Boolean ? (Boolean)o : (o instanceof Double && (Double)o!=0); }
  static String asStr(Object o){ return o==null? "" : o.toString(); }
  @SuppressWarnings("unchecked")
  static List<Object> L(Object o){ return o instanceof List ? (List<Object>)o : new ArrayList<>(); }
  static int[] asIntArr(Object o){ List<Object> l=L(o); int[] r=new int[l.size()]; for(int k=0;k<l.size();k++) r[k]=asInt(l.get(k)); return r; }
  static long[] asLongArr(Object o){ List<Object> l=L(o); long[] r=new long[l.size()]; for(int k=0;k<l.size();k++) r[k]=asLong(l.get(k)); return r; }
  static double[] asDoubleArr(Object o){ List<Object> l=L(o); double[] r=new double[l.size()]; for(int k=0;k<l.size();k++) r[k]=asDouble(l.get(k)); return r; }
  static boolean[] asBoolArr(Object o){ List<Object> l=L(o); boolean[] r=new boolean[l.size()]; for(int k=0;k<l.size();k++) r[k]=asBool(l.get(k)); return r; }
  static String[] asStrArr(Object o){ List<Object> l=L(o); String[] r=new String[l.size()]; for(int k=0;k<l.size();k++) r[k]=asStr(l.get(k)); return r; }
  static int[][] asIntArr2(Object o){ List<Object> l=L(o); int[][] r=new int[l.size()][]; for(int k=0;k<l.size();k++) r[k]=asIntArr(l.get(k)); return r; }
  static String[][] asStrArr2(Object o){ List<Object> l=L(o); String[][] r=new String[l.size()][]; for(int k=0;k<l.size();k++) r[k]=asStrArr(l.get(k)); return r; }
  static String jesc(String s){ StringBuilder b=new StringBuilder("\""); for(int k=0;k<s.length();k++){ char c=s.charAt(k); if(c=='"')b.append("\\\""); else if(c=='\\')b.append("\\\\"); else if(c=='\n')b.append("\\n"); else if(c=='\t')b.append("\\t"); else if(c=='\r')b.append("\\r"); else b.append(c); } b.append("\""); return b.toString(); }
  static String tj(int x){ return ""+x; }
  static String tj(long x){ return ""+x; }
  static String tj(double x){ if(!Double.isInfinite(x) && x==Math.floor(x)) return ""+(long)x; return ""+x; }
  static String tj(boolean x){ return x?"true":"false"; }
  static String tj(String x){ return x==null? "null" : jesc(x); }
  static String tj(int[] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(a[k]); } return b.append("]").toString(); }
  static String tj(long[] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(a[k]); } return b.append("]").toString(); }
  static String tj(double[] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(tj(a[k])); } return b.append("]").toString(); }
  static String tj(boolean[] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(a[k]); } return b.append("]").toString(); }
  static String tj(String[] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(a[k]==null?"null":jesc(a[k])); } return b.append("]").toString(); }
  static String tj(int[][] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(tj(a[k])); } return b.append("]").toString(); }
  static String tj(String[][] a){ StringBuilder b=new StringBuilder("["); for(int k=0;k<a.length;k++){ if(k>0)b.append(","); b.append(tj(a[k])); } return b.append("]").toString(); }
  static String tjObj(Object o){ if(o==null) return "null"; if(o instanceof Integer||o instanceof Long) return o.toString(); if(o instanceof Double) return tj(((Double)o).doubleValue()); if(o instanceof Boolean) return tj(((Boolean)o).booleanValue()); if(o instanceof String) return jesc((String)o); if(o instanceof List) return tj((List<?>)o); return jesc(o.toString()); }
  static String tj(List<?> a){ StringBuilder b=new StringBuilder("["); boolean f=true; for(Object o:a){ if(!f)b.append(","); f=false; b.append(tjObj(o)); } return b.append("]").toString(); }
  static String b64(byte[] in){ return Base64.getEncoder().encodeToString(in); }`;

function javaType(rawType) {
  const t = String(rawType || "int").trim().toLowerCase().replace(/\s+/g, "");
  const map = {
    "int": ["int", "asInt"],
    "integer": ["int", "asInt"],
    "long": ["long", "asLong"],
    "float": ["double", "asDouble"],
    "double": ["double", "asDouble"],
    "bool": ["boolean", "asBool"],
    "boolean": ["boolean", "asBool"],
    "char": ["String", "asStr"],
    "string": ["String", "asStr"],
    "int[]": ["int[]", "asIntArr"],
    "long[]": ["long[]", "asLongArr"],
    "float[]": ["double[]", "asDoubleArr"],
    "double[]": ["double[]", "asDoubleArr"],
    "bool[]": ["boolean[]", "asBoolArr"],
    "string[]": ["String[]", "asStrArr"],
    "int[][]": ["int[][]", "asIntArr2"],
    "string[][]": ["String[][]", "asStrArr2"],
  };
  return map[t] || ["String", "asStr"];
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

export function generateJavaSource(signature, userCode) {
  const { fn, params, ret } = normSpec(signature);

  const reads = params
    .map((p, i) => {
      const t = String(p.type || "").trim().toLowerCase().replace(/\s+/g, "");
      if (t === "string" || t === "char") {
        return `      String arg${i} = readStr(__br.readLine());`;
      }
      const [decl, extract] = javaType(p.type);
      return `      ${decl} arg${i} = ${extract}(parseJson(__br.readLine()));`;
    })
    .join("\n");
  const argList = params.map((_, i) => `arg${i}`).join(", ");

  const isVoid = ret.toLowerCase() === "void";
  const [retDecl] = javaType(ret);
  const callBlock = isVoid
    ? `        new Solution().${fn}(${argList}); __res = "null";`
    : `        ${retDecl} __r = new Solution().${fn}(${argList}); __res = tj(__r);`;

  const main = `  public static void main(String[] __args) throws Exception {
    BufferedReader __br = new BufferedReader(new InputStreamReader(System.in));
    String __tl = __br.readLine();
    int T; try { T = Integer.parseInt(__tl.trim()); } catch(Exception __e){ return; }
    StringBuilder __out = new StringBuilder();
    PrintStream __real = System.out;
    for (int __tc=0; __tc<T; __tc++) {
${reads}
      ByteArrayOutputStream __cap = new ByteArrayOutputStream();
      System.setOut(new PrintStream(__cap, true, "UTF-8"));
      String __res = "null"; String __err = "";
      try {
${callBlock}
      } catch (Throwable __t) { __err = __t.toString(); }
      System.setOut(__real);
      __out.append("\\u001E").append(__res).append("\\u001F").append(b64(__cap.toByteArray())).append("\\u001F").append(b64(__err.getBytes("UTF-8"))).append("\\n");
    }
    System.out.print(__out.toString());
  }`;

  return `import java.util.*;\nimport java.io.*;\n\n${userCode}\n\nclass Main {\n${JAVA_HELPERS}\n${main}\n}\n`;
}

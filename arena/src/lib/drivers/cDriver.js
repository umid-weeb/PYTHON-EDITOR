/**
 * C driver generator (runs on Godbolt via the same cloud path).
 *
 * C has no STL, and the C stub passes arrays as pointer + size and returns
 * arrays via a malloc'd pointer + `int* returnSize` out-param (LeetCode style):
 *
 *     int* twoSum(int* nums, int numsSize, int target, int* returnSize)
 *
 * The generated main() reads all test cases from stdin, parses each argument
 * with small hand-rolled parsers, calls the user's function with the extra
 * size params, captures its stdout via a pipe redirect (dup2), serializes the
 * result to JSON, and prints one marked record per case.
 *
 * A segfault kills the whole process — the browser side already reports the
 * missing case records as a Runtime Error with stderr.
 */

const C_PRELUDE = String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdarg.h>
#include <math.h>
#include <unistd.h>
#include <fcntl.h>

/* ---- line reading ---- */
static char* pz_getline(void){
  size_t cap=256,len=0; char*buf=(char*)malloc(cap); int c;
  while((c=fgetc(stdin))!=EOF && c!='\n'){
    if(len+2>=cap){cap*=2;buf=(char*)realloc(buf,cap);}
    buf[len++]=(char)c;
  }
  while(len>0&&(buf[len-1]=='\r'||buf[len-1]==' '||buf[len-1]=='\t'))len--;
  buf[len]=0; return buf;
}
static const char* pz_ws(const char*s){while(*s==' '||*s=='\t')s++;return s;}

/* ---- scalar parsers ---- */
static long long pz_ll(const char*s){return strtoll(pz_ws(s),NULL,10);}
static double pz_dd(const char*s){return strtod(pz_ws(s),NULL);}
static bool pz_bb(const char*s){s=pz_ws(s);return s[0]=='t'||s[0]=='T'||s[0]=='1';}

/* ---- array parsers ---- */
static int* pz_arr_int(const char*s,int*outn){
  int cap=8,n=0; int*a=(int*)malloc(cap*sizeof(int));
  s=pz_ws(s); if(*s=='[')s++;
  while(*s){ s=pz_ws(s); if(*s==']'||!*s)break;
    char*end; long v=strtol(s,&end,10);
    if(end==s){s++;continue;}
    if(n>=cap){cap*=2;a=(int*)realloc(a,cap*sizeof(int));}
    a[n++]=(int)v; s=end; s=pz_ws(s); if(*s==',')s++; }
  *outn=n; return a;
}
static long* pz_arr_long(const char*s,int*outn){
  int cap=8,n=0; long*a=(long*)malloc(cap*sizeof(long));
  s=pz_ws(s); if(*s=='[')s++;
  while(*s){ s=pz_ws(s); if(*s==']'||!*s)break;
    char*end; long long v=strtoll(s,&end,10);
    if(end==s){s++;continue;}
    if(n>=cap){cap*=2;a=(long*)realloc(a,cap*sizeof(long));}
    a[n++]=(long)v; s=end; s=pz_ws(s); if(*s==',')s++; }
  *outn=n; return a;
}
static double* pz_arr_dbl(const char*s,int*outn){
  int cap=8,n=0; double*a=(double*)malloc(cap*sizeof(double));
  s=pz_ws(s); if(*s=='[')s++;
  while(*s){ s=pz_ws(s); if(*s==']'||!*s)break;
    char*end; double v=strtod(s,&end);
    if(end==s){s++;continue;}
    if(n>=cap){cap*=2;a=(double*)realloc(a,cap*sizeof(double));}
    a[n++]=v; s=end; s=pz_ws(s); if(*s==',')s++; }
  *outn=n; return a;
}
/* JSON-or-raw string */
static char* pz_str(const char*s){
  s=pz_ws(s); size_t L=strlen(s);
  while(L>0&&(s[L-1]==' '||s[L-1]=='\t'))L--;
  if(L>=2&&s[0]=='"'){
    char*r=(char*)malloc(L+1); size_t j=0;
    for(size_t i=1;i<L;i++){ char c=s[i];
      if(c=='"')break;
      if(c=='\\'&&i+1<L){ i++; char e=s[i];
        if(e=='n')r[j++]='\n'; else if(e=='t')r[j++]='\t'; else if(e=='r')r[j++]='\r'; else r[j++]=e;
      } else r[j++]=c; }
    r[j]=0; return r;
  }
  char*r=(char*)malloc(L+1); memcpy(r,s,L); r[L]=0; return r;
}
static char** pz_arr_str(const char*s,int*outn){
  int cap=8,n=0; char**a=(char**)malloc(cap*sizeof(char*));
  const char*p=s;
  while(*p){
    if(*p=='"'){
      const char*q=p+1;
      while(*q && !(*q=='"' && q[-1]!='\\')) q++;
      size_t seg=(size_t)(q-p)+((*q=='"')?1:0);
      char*tmp=(char*)malloc(seg+1); memcpy(tmp,p,seg); tmp[seg]=0;
      if(n>=cap){cap*=2;a=(char**)realloc(a,cap*sizeof(char*));}
      a[n++]=pz_str(tmp); free(tmp);
      p=(*q=='"')?q+1:q;
    } else p++;
  }
  *outn=n; return a;
}

/* ---- string builder + serializers ---- */
typedef struct { char*b; size_t len,cap; } SB;
static void sb_init(SB*s){s->cap=256;s->len=0;s->b=(char*)malloc(s->cap);s->b[0]=0;}
static void sb_putc(SB*s,char c){ if(s->len+2>=s->cap){s->cap*=2;s->b=(char*)realloc(s->b,s->cap);} s->b[s->len++]=c; s->b[s->len]=0; }
static void sb_puts(SB*s,const char*t){ while(t&&*t)sb_putc(s,*t++); }
static void sb_fmt(SB*s,const char*fmt,...){ char tmp[64]; va_list ap; va_start(ap,fmt); vsnprintf(tmp,sizeof tmp,fmt,ap); va_end(ap); sb_puts(s,tmp); }
static void sb_jstr(SB*s,const char*t){
  sb_putc(s,'"');
  for(;t&&*t;t++){ char c=*t;
    if(c=='"'){sb_puts(s,"\\\"");} else if(c=='\\'){sb_puts(s,"\\\\");}
    else if(c=='\n'){sb_puts(s,"\\n");} else if(c=='\t'){sb_puts(s,"\\t");} else if(c=='\r'){sb_puts(s,"\\r");}
    else sb_putc(s,c); }
  sb_putc(s,'"');
}
static void sb_dbl(SB*s,double v){
  if(!isnan(v)&&!isinf(v)&&v==floor(v)&&fabs(v)<1e15){ sb_fmt(s,"%lld",(long long)v); }
  else sb_fmt(s,"%.10g",v);
}

/* ---- base64 ---- */
static char* pz_b64(const char*in,size_t n){
  static const char*T="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t olen=4*((n+2)/3); char*o=(char*)malloc(olen+1); size_t j=0;
  for(size_t i=0;i<n;i+=3){
    unsigned v=(unsigned char)in[i]<<16;
    if(i+1<n)v|=(unsigned char)in[i+1]<<8;
    if(i+2<n)v|=(unsigned char)in[i+2];
    o[j++]=T[(v>>18)&63]; o[j++]=T[(v>>12)&63];
    o[j++]=(i+1<n)?T[(v>>6)&63]:'=';
    o[j++]=(i+2<n)?T[v&63]:'=';
  }
  o[j]=0; return o;
}
`;

// abstract type -> C param info
function cParamInfo(rawType, i) {
  const t = String(rawType || "int").trim().toLowerCase().replace(/\s+/g, "");
  const v = `arg${i}`;
  const scalar = {
    int: [`  int ${v} = (int)pz_ll(__l${i});`, v],
    integer: [`  int ${v} = (int)pz_ll(__l${i});`, v],
    long: [`  long ${v} = (long)pz_ll(__l${i});`, v],
    float: [`  double ${v} = pz_dd(__l${i});`, v],
    double: [`  double ${v} = pz_dd(__l${i});`, v],
    bool: [`  bool ${v} = pz_bb(__l${i});`, v],
    boolean: [`  bool ${v} = pz_bb(__l${i});`, v],
    string: [`  char* ${v} = pz_str(__l${i});`, v],
    char: [`  char* ${v} = pz_str(__l${i});`, v],
  };
  if (scalar[t]) return { decl: scalar[t][0], args: scalar[t][1] };
  const arrays = {
    "int[]": ["int*", "pz_arr_int"],
    "long[]": ["long*", "pz_arr_long"],
    "float[]": ["double*", "pz_arr_dbl"],
    "double[]": ["double*", "pz_arr_dbl"],
    "string[]": ["char**", "pz_arr_str"],
  };
  if (arrays[t]) {
    const [decl, parser] = arrays[t];
    return {
      decl: `  int ${v}Size = 0; ${decl} ${v} = ${parser}(__l${i}, &${v}Size);`,
      args: `${v}, ${v}Size`,
    };
  }
  // 2D arrays are not representable with the current C stub — fail clearly.
  return { decl: `#error "Bu masala turi (${t}) C tilida qo'llab-quvvatlanmaydi"`, args: v };
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

function cReturnBlock(ret, fn, argList) {
  const t = String(ret || "void").trim().toLowerCase().replace(/\s+/g, "");
  const call = (extra) => `${fn}(${argList}${argList && extra ? ", " : ""}${extra || ""})`;
  if (t === "void") return `    ${call("")}; sb_puts(&__res, "null");`;
  if (t === "int" || t === "integer" || t === "long")
    return `    long long __r = (long long)${call("")}; sb_fmt(&__res, "%lld", __r);`;
  if (t === "float" || t === "double") return `    double __r = ${call("")}; sb_dbl(&__res, __r);`;
  if (t === "bool" || t === "boolean") return `    bool __r = ${call("")}; sb_puts(&__res, __r ? "true" : "false");`;
  if (t === "string" || t === "char") return `    char* __r = ${call("")}; sb_jstr(&__res, __r ? __r : "");`;
  if (t === "int[]" || t === "long[]")
    return `    int __rn = 0; int* __r = ${call("&__rn")};
    sb_putc(&__res, '[');
    for (int __k = 0; __k < __rn; __k++) { if (__k) sb_putc(&__res, ','); sb_fmt(&__res, "%d", __r[__k]); }
    sb_putc(&__res, ']');`;
  if (t === "float[]" || t === "double[]")
    return `    int __rn = 0; double* __r = ${call("&__rn")};
    sb_putc(&__res, '[');
    for (int __k = 0; __k < __rn; __k++) { if (__k) sb_putc(&__res, ','); sb_dbl(&__res, __r[__k]); }
    sb_putc(&__res, ']');`;
  if (t === "string[]")
    return `    int __rn = 0; char** __r = ${call("&__rn")};
    sb_putc(&__res, '[');
    for (int __k = 0; __k < __rn; __k++) { if (__k) sb_putc(&__res, ','); sb_jstr(&__res, __r[__k] ? __r[__k] : ""); }
    sb_putc(&__res, ']');`;
  return `#error "Bu qaytish turi (${t}) C tilida qo'llab-quvvatlanmaydi"`;
}

export function generateCSource(signature, userCode) {
  const { fn, params, ret } = normSpec(signature);

  const infos = params.map((p, i) => cParamInfo(p.type, i));
  const readLines = params
    .map((_, i) => `  char* __l${i} = pz_getline();`)
    .concat(infos.map((x) => x.decl))
    .join("\n");
  const argList = infos.map((x) => x.args).join(", ");

  const main = `int main(void){
  char* __tl = pz_getline();
  int __T = (int)pz_ll(__tl);
  for (int __tc = 0; __tc < __T; __tc++) {
${readLines}

    /* capture the user's stdout via a pipe */
    fflush(stdout);
    int __saved = dup(1);
    int __p[2]; if (pipe(__p) != 0) return 1;
    fcntl(__p[1], F_SETFL, O_NONBLOCK);
    dup2(__p[1], 1); close(__p[1]);

    SB __res; sb_init(&__res);
${cReturnBlock(ret, fn, argList)}

    fflush(stdout);
    dup2(__saved, 1); close(__saved);

    SB __cap; sb_init(&__cap);
    { char __buf[4096]; ssize_t __rn2;
      fcntl(__p[0], F_SETFL, O_NONBLOCK);
      while ((__rn2 = read(__p[0], __buf, sizeof __buf)) > 0)
        for (ssize_t __k = 0; __k < __rn2; __k++) sb_putc(&__cap, __buf[__k]);
      close(__p[0]); }

    char* __b64out = pz_b64(__cap.b, __cap.len);
    printf("\\x1E%s\\x1F%s\\x1F\\n", __res.b, __b64out);
  }
  return 0;
}`;

  return `${C_PRELUDE}\n${userCode}\n\n${main}\n`;
}
